# Reservation payment service (Razorpay)

The reservation form takes the reservation amount with Razorpay Standard Checkout. The website
only ever holds the **public Key ID**. Everything that needs the **Key Secret** runs in this small
service (a Cloudflare Worker, `razorpay-worker.js`):

| Route | What it does |
| --- | --- |
| `POST /orders` | Creates the Razorpay order. The amount comes from `RESERVATION_AMOUNT_PAISE`, never from the page. |
| `POST /verify` | Checks the signature Razorpay returns after a payment (HMAC-SHA256 of `order_id\|payment_id` with the Key Secret), and that the payment belongs to the order. |
| `POST /webhook` | Razorpay's webhook, checked with the webhook secret: the server-side record of every payment. |

**Never put the Key Secret in the Universal Editor, the page content or this repository.**
Pages are public HTML: anyone could read a secret stored there and use your Razorpay account.

## Payment states on the site

1. **PROCEED**: the form is checked. The service creates an order, and Razorpay's window opens with the visitor's name, email and mobile filled in.
2. **Verification**: Razorpay processes the payment in its own window. Then a "Verifying your payment" window (Razorpay style) shows while the service checks the signature.
3. **Success**: the visitor goes to the success page (default `/confirmation`). Before that, the form data and the payment id are sent to the form's "Send the form to" URL.
4. **Failure**: when the bank declines or the check fails, the visitor goes to the failure page (default `/payment-failed`). It shows Razorpay's reason and a TRY AGAIN button.
5. **Cancelled**: when the visitor closes Razorpay's window, they stay on the form with a message and can try again.

## Setup (test mode)

1. In the Razorpay Dashboard, switch to **Test Mode**. Under **Account & Settings → API Keys**, generate a key and keep the Key Secret somewhere safe (it's shown once).
2. Deploy the service. You need a free Cloudflare account and Node.js. From this folder:
   ```sh
   npx wrangler login
   npx wrangler secret put RAZORPAY_KEY_ID        # rzp_test_…
   npx wrangler secret put RAZORPAY_KEY_SECRET    # the Key Secret (typed in your terminal only)
   npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
   npx wrangler deploy
   ```
   Wrangler prints the service address, e.g. `https://jsw-payments.<account>.workers.dev`.
   Check `ALLOWED_ORIGINS` and `RESERVATION_AMOUNT_PAISE` in `wrangler.toml`. Add the production
   domain to `ALLOWED_ORIGINS` once it's known.
3. Add the webhook in the Razorpay Dashboard under **Account & Settings → Webhooks**:
   - URL: `<service address>/webhook`
   - Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
4. In the Universal Editor, open the Reservation Form block and fill in the **Payment** tab:
   - **Razorpay Key ID**: `rzp_test_…`, the public key only;
   - **Payment service URL**: the service address;
   - the success and failure pages.
5. Test with Razorpay's test cards and UPI ids (e.g. `success@razorpay` / `failure@razorpay`).

Keep the **Reservation amount** in the block's Pricing tab equal to `RESERVATION_AMOUNT_PAISE / 100`.
The block shows that amount, and the service charges its own.

Without a payment service URL, the form still opens Razorpay with the page's amount. Those
payments are **not verified** and stay "authorized", so use this for a quick test only.

## Switching to JSW's account

1. Generate keys in JSW's Razorpay account (live mode after KYC).
2. Run `npx wrangler secret put …` again with the new values and create the webhook there.
3. Change the Key ID in the Universal Editor.

No code changes are needed.
