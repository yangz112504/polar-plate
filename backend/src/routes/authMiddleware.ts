import type { NextFunction, Request, Response } from "express";
import type { AuthService, TokenPayload } from "../auth/authService";

/** Express request after `requireAuth` has run. */
export type AuthedRequest = Request & { user: TokenPayload };

/**
 * Builds middleware that requires a valid `Authorization: Bearer <jwt>` header.
 * Responds 401 if the header is missing and 403 if the token is invalid or expired;
 * otherwise stores the token payload on `req.user`.
 * @param auth The auth service used to verify tokens.
 */
export function createRequireAuth(auth: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ message: "No token provided" });
      return;
    }
    const payload = auth.verifyToken(header.split(" ")[1]);
    if (!payload) {
      res.status(403).json({ message: "Invalid or expired token" });
      return;
    }
    (req as AuthedRequest).user = payload;
    next();
  };
}
