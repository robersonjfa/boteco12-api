import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { clearSessionCookie } from '../lib/session-security'

/**
 * Tipagem do request autenticado
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    email?: string;
    cpf?: string | null;
    birthDate?: Date | null;
  };
}

/**
 * Middleware de autenticação via SESSION
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) {
      return res.status(401).json({
        error: 'Usuário não autenticado',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        role: true,
        email: true,
        cpf: true,
        birthDate: true,
        adminBlockedAt: true,
        sessionVersion: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Usuário não autenticado',
      });
    }

    if (user.adminBlockedAt) {
      req.session.destroy(() => undefined);
      clearSessionCookie(res)
      return res.status(403).json({
        error: 'account_admin_blocked',
        message: 'Conta bloqueada administrativamente. Entre em contato com o suporte.',
      });
    }

    if (sessionUser.sessionVersion !== user.sessionVersion) {
      req.session.destroy(() => undefined)
      clearSessionCookie(res)
      return res.status(401).json({
        error: 'session_revoked',
        message: 'Sessão revogada. Entre novamente.',
      })
    }

    req.session.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      sessionVersion: user.sessionVersion,
    };
    const requestPath = req.originalUrl.split('?')[0]
    const canCompleteIdentityProfile = requestPath === '/api/me'
    const missingFields = [
      ...(!user.cpf ? ['cpf'] : []),
      ...(!user.birthDate ? ['birthDate'] : []),
    ]
    if (missingFields.length > 0 && !canCompleteIdentityProfile) {
      return res.status(403).json({
        error: 'identity_profile_required',
        message: 'Confirme CPF e data de nascimento no perfil para continuar.',
        missingFields,
      })
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      cpf: user.cpf,
      birthDate: user.birthDate,
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
