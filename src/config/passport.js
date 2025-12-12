import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import User from "../models/User.js";
import {loginRateLimit} from "../middleware/rateLimitMiddleware.js";
// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract user data from Google profile
        const userData = {
          name: profile.displayName,
          gmailId: profile.emails[0].value,
          avatarLink: profile.photos[0]?.value || null,
        };
        let rl = await loginRateLimit(userData)
        if(!rl.success){
          return done(new Error(rl.message), null);
        }
        // Check if user exists
        let user = await User.findByGmailId(userData.gmailId);

        if (!user) {
          // Create new user if doesn't exist
          user = await User.create(userData);
        } else {
          // Update avatar if it has changed
          if (user.avatarLink !== userData.avatarLink) {
            user = await User.updateAvatarLink(user.userId, {
              avatarLink: userData.avatarLink,
            });
          }
        }

        return done(null, user);
      } catch (err) {
        console.error("Google Strategy Error:", err.message);
        return done(err, null);
      }
    }
  )
);

// JWT Strategy for protected routes
const cookieExtractor = (req) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['jwt'];
  }
  // check Authorization header as fallback
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }
  return token;
};

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken()
      ]),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (jwtPayload, done) => {
      try {
        const user = await User.findByUserId(jwtPayload.userId);
        
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      } catch (err) {
        console.error("JWT Strategy Error:", err.message);
        return done(err, false);
      }
    }
  )
);

export default passport;