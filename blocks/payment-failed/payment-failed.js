import { decorateStatus } from '../confirmation/confirmation.js';

/*
 * Payment Failed: the page the reservation form opens after a failed payment, the confirmation
 * page's replica: the same fields, read alike, and the same DOM (the confirmation block's own
 * decoration: its two layouts, its {token} filling, its limits), styled in payment-failed.css.
 * Its defaults (the model's) are the failure's: FAILED, PAYMENT FAILED, {name}., the reason from
 * Razorpay ({failureReason|…}), a TRY AGAIN button back to the reservation form.
 * Rows (each property in its own cell, read by position; the Layout is the block's class):
 *   1. background word   2. status heading   3. description   4. image (+ alt)
 *   5. background image   6. button link (+ its text)
 */
export default function decorate(block) {
  decorateStatus(block, 'payment-failed');
}
