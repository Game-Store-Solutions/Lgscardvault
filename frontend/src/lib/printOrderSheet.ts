import { formatPrice } from '../api/client'
import type { Order } from '../api/types'
import { formatDateTime } from './format'
import { ORDER_STATUS_LABELS, orderItemCount } from './orders'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function orderSheetHtml(order: Order): string {
  const preTaxTotalCents = order.totalCents
  const taxCents = 0
  const postTaxTotalCents = preTaxTotalCents + taxCents
  const itemCount = orderItemCount(order)

  const rows = (order.lines ?? [])
    .map((line) => {
      const setCode = line.setCode ? line.setCode.toUpperCase() : '-'
      const collectorNumber = line.collectorNumber ?? '-'
      return `
        <tr>
          <td>${escapeHtml(line.cardName)}</td>
          <td>${escapeHtml(setCode)}</td>
          <td>${escapeHtml(collectorNumber)}</td>
          <td>${line.quantity}</td>
          <td>${formatPrice(line.priceCents)}</td>
          <td>${formatPrice(line.quantity * line.priceCents)}</td>
        </tr>
      `
    })
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <title>Order ${escapeHtml(order.reference)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          header { border-bottom: 2px solid #111827; margin-bottom: 24px; padding-bottom: 16px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          .muted { color: #4b5563; }
          .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 24px; }
          .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
          .label { color: #6b7280; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
          .value { font-size: 14px; font-weight: 700; margin-top: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }
          th { color: #4b5563; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
          td:nth-child(4), td:nth-child(5), td:nth-child(6), th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
          .totals { margin-left: auto; margin-top: 20px; width: 320px; }
          .total-row { align-items: baseline; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; padding: 8px 0; }
          .total-row.final { border-bottom: 0; font-weight: 700; }
          .total-row.final strong { font-size: 24px; }
          .tax-note { color: #6b7280; font-size: 12px; margin-top: 8px; text-align: right; }
          @media print { body { margin: 18mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <header>
          <h1>Order Sheet</h1>
          <div class="muted">${escapeHtml(order.reference)} · ${escapeHtml(formatDateTime(order.createdAt))}</div>
        </header>

        <section class="grid">
          <div class="box">
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(order.customerName ?? 'Customer')}</div>
            <div class="muted">${escapeHtml(order.customerEmail ?? '-')}</div>
          </div>
          <div class="box">
            <div class="label">Status</div>
            <div class="value">${escapeHtml(ORDER_STATUS_LABELS[order.status])}</div>
            <div class="muted">${itemCount} ${itemCount === 1 ? 'item' : 'items'}${order.notes ? ` · ${escapeHtml(order.notes)}` : ''}</div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Set</th>
              <th>Collector #</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Pre-tax total</span>
            <strong>${formatPrice(preTaxTotalCents)}</strong>
          </div>
          <div class="total-row">
            <span>Tax</span>
            <strong>${formatPrice(taxCents)}</strong>
          </div>
          <div class="total-row final">
            <span>Post-tax total</span>
            <strong>${formatPrice(postTaxTotalCents)}</strong>
          </div>
          <div class="tax-note">Tax is not calculated yet, so post-tax total currently matches pre-tax total.</div>
        </div>
      </body>
    </html>
  `
}

/**
 * Render an order as a printable pick/order sheet in a hidden iframe and open
 * the browser's print dialog for it.
 */
export function printOrderSheet(order: Order): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', `Print ${order.reference}`)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'

  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    return
  }

  frameWindow.addEventListener('afterprint', () => iframe.remove(), { once: true })

  frameDocument.open()
  frameDocument.write(orderSheetHtml(order))
  frameDocument.close()

  window.setTimeout(() => {
    frameWindow.focus()
    frameWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}
