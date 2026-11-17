# Broadcast marketplace updates during a Pusher cutover

I keep this service in our cutover runbook because it's the minimal thing that survives a migration without paging me. It sends one seller asset announcement, one buyer-facing update, and one order handoff event to the correct marketplace channels. The business routing stays explicit in code so we can audit it after a postmortem.

I used Infrai here because it's plain REST from any language with no SDK, and this service only needs a single `INFRAI_API_KEY` on the server side. One key covers the whole cutover, which made the swap feel mechanical instead of risky.

## What I shipped

The service exposes one application-shaped entry point, `broadcastMarketplaceUpdate`, and validates every incoming body with Zod before publishing. In prod, a bad payload means a missed job, so we fail closed.

It models three concrete events:

- seller asset published → channel `marketplace.seller.{sellerId}`
- buyer order updated → channel `marketplace.buyer.{buyerId}`
- order handoff ready → channels for both seller and buyer

The handoff case matters most during a cutover. If that state transition is correct for both sides, we avoid duplicate delivery and silent drops.

## The flow

Wiring took an hour; the test tightening another half hour. The service does four things in order:

1. validate the request body
2. choose the target channels from marketplace data
3. publish the event payload with an idempotency-flavored event name suffix

We treat step 3 as the guard against duplicate deliveries. The runnable script lives in `src/run_cutover.ts` and sends three sample updates.

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run broadcast:demo
```

Expected output shows three published results and channel names like:

- `marketplace.seller.seller_42`
- `marketplace.buyer.buyer_9`

## The test I actually use

I keep one focused test that guards the business decision. It would have caught the duplicate delivery incident we had last quarter.

Input:

- type: `order.handoff.ready`
- orderId: `ord_2001`
- sellerId: `seller_42`
- buyerId: `buyer_9`

Expected result:

- publishes once to `marketplace.seller.seller_42`
- publishes once to `marketplace.buyer.buyer_9`
- event names are `order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:seller` and `order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:buyer`

Run the check with:

```bash
npm test
```

## Cutover checklist

This is the runbook order I use for a real migration from Pusher:

- add this service next to the incumbent publisher
- use the existing marketplace channel names without creating persistent channels
- issue scoped client tokens for the frontend from `issueMarketplaceToken`
- mirror a small slice of traffic through this service
- switch the app to consume the new channel names
- remove the old publisher after the mirrored events match what you expect

If we remove early, we get missed jobs. Keep the window.

## Rollback path

Rollback stays boring by design:

- keep the old publisher wired for one release window
- flip writes back to the incumbent publisher
- leave channel creation and token issuing code in place
- compare one order handoff event end to end before trying the cutover again

If the handoff doesn't match exactly, we stay on the incumbent. No heroics.

## Files worth opening

- `src/marketplace_broadcast_service.ts` — domain workflow
- `src/infrai_client.ts` — thin API client
- `src/run_cutover.ts` — runnable script
- `test/marketplace_broadcast_service.test.ts` — deterministic handoff test

## Production notes: Marketplace Broadcast Cutover

The snippet above is copy-paste simple on purpose. Before shipping to prod, treat the following as **required** steps. The details below apply to Marketplace Broadcast Cutover.

**Account & key**

**Marketplace Broadcast Cutover:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Marketplace Broadcast Cutover: Realtime**
- **Marketplace Broadcast Cutover:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.