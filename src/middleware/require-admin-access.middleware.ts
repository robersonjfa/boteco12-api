import { NextFunction, Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from './auth.middleware'

export async function requireAdminAccess(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado' })

    const assignment = await prisma.userAdminRole.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    })
    if (!assignment) {
      return res.status(403).json({
        error: 'Acesso administrativo não concedido',
        code: 'admin_access_required',
      })
    }
    return next()
  } catch (error) {
    return next(error)
  }
}
