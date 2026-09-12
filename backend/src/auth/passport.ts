import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export const configurePassport = () => {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value;
            const name = profile.displayName || email?.split('@')[0] || 'User';
            const avatarUrl = profile.photos?.[0]?.value;

            if (!email) {
              return done(new Error('No email found in Google account profile'), undefined);
            }

            // Find existing user by googleId or email
            let user = await prisma.user.findFirst({
              where: {
                OR: [{ googleId }, { email }],
              },
            });

            if (user) {
              // Update googleId or avatar if missing
              if (!user.googleId || !user.avatarUrl) {
                user = await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    googleId: user.googleId || googleId,
                    avatarUrl: user.avatarUrl || avatarUrl,
                  },
                });
              }
            } else {
              // Create new user and default sender
              user = await prisma.user.create({
                data: {
                  googleId,
                  email,
                  name,
                  avatarUrl,
                  senders: {
                    create: {
                      email,
                      displayName: name,
                      smtpHost: 'smtp.ethereal.email',
                      smtpPort: 587,
                      enabled: true,
                    },
                  },
                },
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        },
      ),
    );
  } else {
    console.warn('⚠️ Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) not set in environment. Real Google OAuth is disabled until credentials are provided.');
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
