import PDFDocument from 'pdfkit';
import { join } from 'path';
import type { Order, PaymentAttempt } from './entities';
export const receiptNumber = (id: string) => 'RC-' + id.toUpperCase();
export async function createReceipt(
  order: Order,
  payment: PaymentAttempt,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 44,
    bufferPages: true,
    info: { Title: 'Pletosie - Reçu de paiement', Author: 'Pletosie' },
  });
  doc.registerFont(
    'Regular',
    join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
  );
  doc.registerFont(
    'Bold',
    join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Bold.ttf'),
  );
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const ink = '#182020',
    muted = '#68716c',
    lime = '#c5f137',
    line = '#e1e6df';
  const amount = (value: number) =>
    new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
  const text = (
    value: string,
    x: number,
    y: number,
    size = 10,
    color = ink,
    width = 507,
    bold = false,
  ) => {
    doc
      .font(bold ? 'Bold' : 'Regular')
      .fontSize(size)
      .fillColor(color)
      .text(value, x, y, { width, lineGap: 2 });
  };
  doc.rect(0, 0, 596, 180).fill(ink);
  text('pletosie', 44, 35, 35, '#ffffff', 340, true);
  text('DU STYLE. DU CARACTÈRE.', 46, 85, 9, '#cbd6ce');
  doc.roundedRect(421, 43, 130, 30, 15).fill(lime);
  text('PAIEMENT REÇU', 433, 51, 9, ink, 120, true);
  text('Votre style, réglé.', 44, 122, 27, '#ffffff', 480, true);
  text('REÇU DE PAIEMENT', 44, 202, 10, muted, 507, true);
  text(receiptNumber(payment.id), 44, 224, 10, ink, 310, true);
  text(
    'Réglé le ' +
      new Date(order.paidAt || payment.updatedAt).toLocaleString('fr-FR', {
        timeZone: 'Africa/Porto-Novo',
      }),
    44,
    248,
    9,
    muted,
  );
  text('REÇU POUR', 362, 202, 9, muted, 190, true);
  text(order.address.name, 362, 224, 10, ink, 190, true);
  doc.roundedRect(44, 285, 507, 81, 15).fill('#f0f6e4');
  text('MONTANT ENCAISSÉ', 62, 300, 9, muted, 300, true);
  text(amount(payment.amount), 62, 318, 28, ink, 460, true);
  let y = 393;
  const tableHeader = () => {
    doc.rect(44, y, 507, 27).fill('#f5f7f3');
    text('VOTRE SÉLECTION', 55, y + 8, 9, muted, 320, true);
    text('MONTANT', 455, y + 8, 9, muted, 90, true);
    y += 40;
  };
  const newPage = () => {
    doc.addPage();
    text('pletosie', 44, 30, 24, ink, 330, true);
    text(receiptNumber(payment.id), 44, 68, 9, muted);
    y = 100;
    tableHeader();
  };
  tableHeader();
  for (const item of order.items) {
    const details =
      item.quantity +
      ' × ' +
      amount(item.price) +
      ' · ' +
      item.color +
      ' / ' +
      item.size;
    doc.font('Bold').fontSize(11);
    const nameHeight = doc.heightOfString(item.name, { width: 325 });
    doc.font('Regular').fontSize(9);
    const detailsHeight = doc.heightOfString(details, { width: 325 });
    const height = Math.max(48, nameHeight + detailsHeight + 20);
    if (y + height > 695) newPage();
    text(item.name, 55, y, 11, ink, 325, true);
    text(details, 55, y + nameHeight + 5, 9, muted, 325);
    text(amount(item.quantity * item.price), 421, y, 10, ink, 125, true);
    y += height;
    doc
      .moveTo(44, y - 9)
      .lineTo(551, y - 9)
      .strokeColor(line)
      .stroke();
  }
  if (y > 590) newPage();
  y += 12;
  text('Articles', 330, y, 10, muted, 90);
  text(amount(order.subtotal), 435, y, 10, ink, 110, true);
  y += 24;
  text('Livraison', 330, y, 10, muted, 90);
  text(amount(order.deliveryFee), 435, y, 10, ink, 110, true);
  y += 30;
  text('Commande', 44, y, 9, muted, 80);
  text(order.id.toUpperCase(), 130, y, 9, ink, 420);
  y += 23;
  text('Opérateur', 44, y, 9, muted, 80);
  text(
    payment.operator === 'celtiis_bj'
      ? 'Celtiis'
      : payment.operator.toUpperCase(),
    130,
    y,
    10,
    ink,
    420,
  );
  y += 23;
  text('Transaction', 44, y, 9, muted, 80);
  text(payment.reference || '', 130, y, 9, ink, 420);
  y += 38;
  text(
    'Merci de faire vivre votre style avec Pletosie.',
    44,
    y,
    12,
    ink,
    500,
    true,
  );
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(44, 771).lineTo(551, 771).strokeColor(line).stroke();
    text(
      'Reçu émis après confirmation du paiement · XOF · Bénin',
      44,
      784,
      8,
      muted,
      450,
    );
    text(i + 1 + ' / ' + pages.count, 510, 784, 8, muted, 40);
  }
  doc.end();
  return complete;
}
