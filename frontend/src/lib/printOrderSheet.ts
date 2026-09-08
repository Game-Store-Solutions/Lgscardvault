import api, { formatPrice } from '../api/client'
import type { Order, OrderLine } from '../api/types'
import { CONDITION_LABELS, type Condition } from '../components/inventory/condition'
import { finishLabel } from './finishes'
import { paymentSubtitle } from './orderManagementUi'
import { ORDER_STATUS_LABELS, formatOrderShortDate, orderItemCount } from './orders'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function printFinishLabel(finish?: string | null): string {
  const label = finishLabel(finish ?? '')
  if (!label) return ''
  if (label === 'Nonfoil') return 'Non-Foil'
  return label
}

function printConditionLabel(condition?: string | null): string {
  if (!condition) return ''
  return CONDITION_LABELS[condition as Condition] ?? condition
}

function printRarity(rarity?: string | null): string {
  if (!rarity) return ''
  return rarity.charAt(0).toUpperCase() + rarity.slice(1)
}

function lineDescription(line: OrderLine): string {
  if (line.isSealed) return line.cardName

  const parts = [line.cardName]

  const finish = printFinishLabel(line.finish)
  if (finish) parts.push(`(${finish})`)

  const condition = printConditionLabel(line.condition)
  if (condition) parts.push(condition)

  for (const tag of line.printingTags ?? []) {
    if (tag.trim()) parts.push(tag.trim())
  }

  return parts.join(', ')
}

function lineSet(line: OrderLine): string {
  const code = line.setCode?.trim()
  const name = line.setName?.trim()
  if (code && name) return `${code.toUpperCase()} / ${name}`
  if (name) return name
  if (code) return code.toUpperCase()
  return ''
}

function lineLocation(line: OrderLine): string {
  const caseQuantity = line.caseQuantity ?? 0
  if (caseQuantity <= 0) return ''

  const location = [line.caseName, line.sectionTitle].filter(Boolean).join(' / ')
  const label = location || 'Case'
  if (caseQuantity < line.quantity) return `${label} (${caseQuantity} of ${line.quantity})`

  return label
}

function pickHeading(order: Order): string {
  const lines = order.lines ?? []
  const total = orderItemCount(order)
  const cardQty = lines.filter((line) => !line.isSealed).reduce((sum, line) => sum + line.quantity, 0)
  const sealedQty = total - cardQty
  const cardWord = cardQty === 1 ? 'card' : 'cards'

  if (sealedQty <= 0) return `Items to Pick (${total} total, ${cardQty} ${cardWord}):`
  if (cardQty <= 0) return `Items to Pick (${total} total, ${sealedQty} sealed):`
  return `Items to Pick (${total} total, ${cardQty} ${cardWord}, ${sealedQty} sealed):`
}

function orderTypeLabel(order: Order): string {
  return order.channel === 'kiosk' ? 'Kiosk Order' : 'Online Order'
}

function fulfillmentLabel(order: Order): string {
  return order.fulfillment === 'shipping' ? 'Shipping' : 'In-Store Pickup'
}

function printPaymentStatus(order: Order): string {
  const subtitle = paymentSubtitle(order)
  if (subtitle === 'Pay in store' && order.fulfillment !== 'shipping') return 'Due at Pickup'
  return subtitle
}

function metaRow(label: string, value: string): string {
  return `<div class="meta-row"><span class="k">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`
}

function moneyTotals(order: Order): { taxCents: number; subtotalCents: number; totalCents: number } {
  const taxCents = order.taxCents ?? 0
  const subtotalCents = order.totalCents
  return { taxCents, subtotalCents, totalCents: subtotalCents + taxCents }
}

function orderSheetHtml(order: Order): string {
  const lines = order.lines ?? []
  const { taxCents, subtotalCents, totalCents } = moneyTotals(order)
  const showLocation = lines.some((line) => (line.caseQuantity ?? 0) > 0)

  const rows = lines
    .map((line) => {
      const locationCell = showLocation ? `<td class="location">${escapeHtml(lineLocation(line))}</td>` : ''
      const rarity = line.isSealed ? 'Sealed' : printRarity(line.rarity)
      const collector = line.isSealed ? '' : (line.collectorNumber ?? '')
      return `
        <tr>
          <td class="qty">${line.quantity}</td>
          <td class="description">${escapeHtml(lineDescription(line))}</td>
          <td class="set">${escapeHtml(lineSet(line))}</td>
          <td class="rarity">${escapeHtml(rarity)}</td>
          <td class="num">${escapeHtml(collector)}</td>
          <td class="price">${formatPrice(line.priceCents)}</td>
          ${locationCell}
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
          html, body { background: #fff; color: #111; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 28px; }
          h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; text-align: center; }
          .meta { margin: 0 0 22px; }
          .meta-row { line-height: 1.55; }
          .meta-row .k { font-weight: 700; }
          h2 { font-size: 14px; font-weight: 700; margin: 0 0 10px; }
          table { border-collapse: collapse; table-layout: fixed; width: 100%; }
          th, td { padding: 8px 6px; text-align: left; vertical-align: top; }
          th { border-bottom: 1px solid #111; font-size: 12px; font-weight: 700; padding-bottom: 10px; }
          td { border-bottom: 1px solid #d4d4d4; padding: 18px 6px; height: 3.4rem; }
          col.qty { width: 5%; }
          col.description { width: 46%; }
          col.set { width: 20%; }
          col.rarity { width: 8%; }
          col.num { width: 6%; }
          col.price { width: 15%; }
          table.has-location col.description { width: 38%; }
          table.has-location col.set { width: 16%; }
          table.has-location col.price { width: 12%; }
          table.has-location col.location { width: 15%; }
          .qty, .rarity, .num, .price { white-space: nowrap; }
          .price { text-align: right; }
          th.price { text-align: right; }
          .description { padding-right: 10px; overflow-wrap: normal; word-break: normal; }
          .set, .location { overflow-wrap: break-word; word-break: normal; }
          .totals { margin-left: auto; margin-top: 18px; width: 240px; page-break-inside: avoid; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
          .total-row.final { font-weight: 700; margin-top: 4px; }
          .money-summary { margin: 0 0 18px; padding: 10px 0; border-top: 1px solid #111; border-bottom: 1px solid #111; width: 240px; }
          @media print { body { margin: 14mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Order Sheet</h1>
        <section class="meta">
          ${metaRow('Buyer Name', order.customerName ?? 'Customer')}
          ${metaRow('Order Number', order.reference)}
          ${metaRow('Order Date', formatOrderShortDate(order.createdAt))}
          ${metaRow('Order Type', orderTypeLabel(order))}
          ${metaRow('Fulfillment Method', fulfillmentLabel(order))}
          ${metaRow('Payment Status', printPaymentStatus(order))}
          ${metaRow('Order Status', ORDER_STATUS_LABELS[order.status])}
        </section>
        <div class="money-summary">
          <div class="total-row"><span>Subtotal:</span><span>${formatPrice(subtotalCents)}</span></div>
          <div class="total-row"><span>Tax:</span><span>${formatPrice(taxCents)}</span></div>
          <div class="total-row final"><span>Total:</span><span>${formatPrice(totalCents)}</span></div>
        </div>
        <h2>${escapeHtml(pickHeading(order))}</h2>
        <table class="${showLocation ? 'has-location' : ''}">
          <colgroup>
            <col class="qty" />
            <col class="description" />
            <col class="set" />
            <col class="rarity" />
            <col class="num" />
            <col class="price" />
            ${showLocation ? '<col class="location" />' : ''}
          </colgroup>
          <thead>
            <tr>
              <th class="qty">QTY</th>
              <th class="description">Description</th>
              <th class="set">Set</th>
              <th class="rarity">Rarity</th>
              <th class="num">#</th>
              <th class="price">Price</th>
              ${showLocation ? '<th class="location">Location</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Subtotal:</span><span>${formatPrice(subtotalCents)}</span></div>
          <div class="total-row"><span>Tax:</span><span>${formatPrice(taxCents)}</span></div>
          <div class="total-row final"><span>Total:</span><span>${formatPrice(totalCents)}</span></div>
        </div>
      </body>
    </html>
  `
}

/**
 * For kiosk / pay-in-store orders that never captured Square tax online,
 * refresh location tax onto the order before printing.
 */
async function orderWithLocationTax(slug: string | undefined, order: Order): Promise<Order> {
  if (!slug || (order.taxCents ?? 0) > 0) return order
  try {
    const { data } = await api.post<Order>(`/stores/${slug}/orders/${order.id}/sync-tax`)
    return data
  } catch {
    return order
  }
}

function openPrintFrame(order: Order): void {
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

/**
 * Render an order as a printable pick/order sheet in a hidden iframe and open
 * the browser's print dialog for it. When `slug` is provided and the order has
 * no tax yet, Square location tax is synced first.
 */
export async function printOrderSheet(order: Order, slug?: string): Promise<Order> {
  const printable = await orderWithLocationTax(slug, order)
  openPrintFrame(printable)
  return printable
}
