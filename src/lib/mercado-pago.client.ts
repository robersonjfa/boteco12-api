import axios, { AxiosInstance } from 'axios'
import { randomUUID } from 'crypto'
import { AppError } from '../errors/AppError'

/**
 * Cliente HTTP para a API do Mercado Pago.
 *
 * Usa `MP_API_BASE_URL` (default: https://api.mercadopago.com) para
 * permitir uso em sandbox ou ambientes mockados sem mudar código.
 *
 * Toda mutação envia `X-Idempotency-Key` para garantir que retentativas
 * de rede não criem operações duplicadas no MP.
 */
function assertPaymentId(paymentId: string): string {
  if (!/^\d{1,32}$/.test(paymentId)) {
    throw AppError.badRequest('paymentId inválido', 'invalid_payment_id')
  }
  return paymentId
}

export class MercadoPagoClient {
  private readonly http: AxiosInstance

  constructor(private readonly accessToken: string) {
    this.http = axios.create({
      baseURL:
        process.env.MP_API_BASE_URL?.replace(/\/+$/, '') ??
        'https://api.mercadopago.com',
      timeout: 15_000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  }

  // ----------------------------------------------------------------
  // Pagamentos
  // ----------------------------------------------------------------

  async createPreference(
    body: Record<string, unknown>,
    idempotencyKey: string = randomUUID()
  ) {
    const { data } = await this.http.post('/checkout/preferences', body, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    })
    return data
  }

  async getPayment(paymentId: string) {
    const safePaymentId = assertPaymentId(paymentId)
    const { data } = await this.http.get(`/v1/payments/${safePaymentId}`)
    return data
  }

  /**
   * Reembolso total ou parcial. `amount` em reais (number).
   * Se omitido, faz reembolso total.
   * Documentação: https://www.mercadopago.com.br/developers/pt/reference/chargebacks/_payments_id_refunds/post
   */
  async refundPayment(paymentId: string, amount?: number) {
    const safePaymentId = assertPaymentId(paymentId)
    const body = amount != null ? { amount } : {}
    const { data } = await this.http.post(
      `/v1/payments/${safePaymentId}/refunds`,
      body,
      { headers: { 'X-Idempotency-Key': randomUUID() } }
    )
    return data
  }

  // ----------------------------------------------------------------
  // Assinaturas (preapproval)
  // ----------------------------------------------------------------

  async getSubscription(subscriptionId: string) {
    const { data } = await this.http.get(`/preapproval/${subscriptionId}`)
    return data
  }

  /**
   * Cancela uma assinatura recorrente.
   * MP usa PUT em /preapproval/:id com status=cancelled.
   */
  async cancelSubscription(subscriptionId: string) {
    const { data } = await this.http.put(
      `/preapproval/${subscriptionId}`,
      { status: 'cancelled' },
      { headers: { 'X-Idempotency-Key': randomUUID() } }
    )
    return data
  }
}
