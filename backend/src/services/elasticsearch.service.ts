import { esClient } from '../config/elasticsearch.js';
import { prisma } from '../config/prisma.js';

export const EMAILS_INDEX = 'emails';

export interface EmailSearchDocument {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
}

export class ElasticsearchService {
  private static isConnected: boolean | null = null;

  /**
   * Ping Elasticsearch to check connectivity
   */
  public static async checkHealth(): Promise<boolean> {
    try {
      const ping = await esClient.ping();
      this.isConnected = ping;
      return ping;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Initializes the 'emails' index with full-text mappings if not present
   */
  public static async initIndex(): Promise<void> {
    if (this.isConnected === false) return;
    try {
      const exists = await esClient.indices.exists({ index: EMAILS_INDEX });
      if (!exists) {
        await esClient.indices.create({
          index: EMAILS_INDEX,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              recipient: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              subject: {
                type: 'text',
                analyzer: 'standard',
              },
              body: {
                type: 'text',
                analyzer: 'standard',
              },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        });
        console.log(`🔍 [Elasticsearch] Created index: ${EMAILS_INDEX}`);
      }
    } catch (err: any) {
      this.isConnected = false;
      console.warn(`⚠️ [Elasticsearch] Index init skipped or failed: ${err.message}`);
    }
  }

  /**
   * Index or update an email document
   */
  public static async indexEmail(doc: EmailSearchDocument): Promise<void> {
    if (this.isConnected === false) return;
    try {
      await esClient.index({
        index: EMAILS_INDEX,
        id: doc.id,
        document: doc,
      });
    } catch (err: any) {
      this.isConnected = false;
      console.warn(`⚠️ [Elasticsearch] Failed to index email ${doc.id}: ${err.message}`);
    }
  }

  /**
   * Remove an email from index
   */
  public static async removeEmail(id: string): Promise<void> {
    try {
      await esClient.delete({
        index: EMAILS_INDEX,
        id,
      });
    } catch (err: any) {
      console.warn(`⚠️ [Elasticsearch] Failed to delete email ${id}: ${err.message}`);
    }
  }

  /**
   * Full-text search with strict user isolation.
   * Gracefully falls back to relational DB if Elasticsearch is unreachable.
   */
  public static async searchEmails(
    userId: string,
    query: string,
    status?: string,
  ): Promise<{ emails: any[]; source: 'elasticsearch' | 'database' }> {
    const trimmed = query.trim();

    try {
      // Build ES boolean query
      const mustClauses: any[] = [{ term: { userId } }];

      if (status) {
        mustClauses.push({ term: { status } });
      }

      if (trimmed) {
        mustClauses.push({
          multi_match: {
            query: trimmed,
            fields: ['subject^3', 'recipient^2', 'body'],
            fuzziness: 'AUTO',
          },
        });
      } else {
        mustClauses.push({ match_all: {} });
      }

      const esResult = await esClient.search({
        index: EMAILS_INDEX,
        query: {
          bool: {
            must: mustClauses,
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
        size: 50,
      });

      const hits = esResult.hits.hits;
      const ids = hits.map((h: any) => h._id);

      if (ids.length === 0) {
        return { emails: [], source: 'elasticsearch' };
      }

      // Hydrate with DB relationships (sender, etc.) in matched order
      const dbEmails = await prisma.email.findMany({
        where: { id: { in: ids }, userId },
        include: { sender: true },
      });

      const emailMap = new Map(dbEmails.map((e) => [e.id, e]));
      const ordered = ids.map((id) => emailMap.get(id)).filter(Boolean);

      return { emails: ordered, source: 'elasticsearch' };
    } catch (esError: any) {
      console.warn(`⚠️ [Elasticsearch] Search query failed, falling back to database: ${esError.message}`);

      // Database fallback with case-insensitive search
      const dbEmails = await prisma.email.findMany({
        where: {
          userId,
          ...(status ? { status: status as any } : {}),
          ...(trimmed
            ? {
                OR: [
                  { subject: { contains: trimmed, mode: 'insensitive' } },
                  { body: { contains: trimmed, mode: 'insensitive' } },
                  { recipient: { contains: trimmed, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { sender: true },
        orderBy: { scheduledAt: 'desc' },
      });

      return { emails: dbEmails, source: 'database' };
    }
  }

  /**
   * Bulk reindexes all emails for a user or entire system
   */
  public static async reindexAll(userId?: string): Promise<{ indexed: number; failed: number }> {
    const emails = await prisma.email.findMany({
      where: userId ? { userId } : {},
    });

    let indexed = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        await this.indexEmail({
          id: email.id,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt: email.scheduledAt.toISOString(),
          sentAt: email.sentAt ? email.sentAt.toISOString() : null,
          createdAt: email.createdAt.toISOString(),
        });
        indexed++;
      } catch {
        failed++;
      }
    }

    return { indexed, failed };
  }
}
