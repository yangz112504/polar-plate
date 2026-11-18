import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { AuthService, TokenPayload } from "../auth/authService";
import type { UserRepository } from "../users/userRepository";

/** Express request after `requireAuth` has run. */
export type AuthedRequest = Request & { user: TokenPayload };

/**
 * Builds middleware that requires a valid `Authorization: Bearer <jwt>` header.
 * Responds 401 if the header is missing and 403 if the token is invalid, expired or revoked.
 * A token is revoked when its user no longer exists or its `tokenVersion` claim differs from the
 * user's row (the version is bumped on password change). This costs one primary-key lookup per request.
 * On success it stores the payload on `req.user`, with `username` taken from the DB so it is never stale.
 * @param auth The auth service used to verify tokens.
 * @param users The user repository used to check the token against the current user row.
 */
export function createRequireAuth(auth: AuthService, users: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ message: "No token provided" });
      return;
    }
    const payload = auth.verifyToken(header.split(" ")[1]);
    // Old tokens from the Mongo era carry a non-uuid userId, which would make the uuid column query throw.
    if (!payload || !z.uuid().safeParse(payload.userId).success) {
      res.status(403).json({ message: "Invalid or expired token" });
      return;
    }
    const user = await users.findUserById(payload.userId);
    // `?? 0`: tokens issued before tokenVersion existed keep working until the first password change.
    if (!user || (payload.tokenVersion ?? 0) !== user.tokenVersion) {
      res.status(403).json({ message: "Invalid or expired token" });
      return;
    }
    (req as AuthedRequest).user = { userId: user.id, username: user.username, tokenVersion: user.tokenVersion };
    next();
  };
}
