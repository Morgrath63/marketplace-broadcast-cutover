import { describe, expect, it } from 'vitest';
import { broadcastMarketplaceUpdate, type RealtimePublisher } from '../src/marketplace_broadcast_service.js';

describe('broadcastMarketplaceUpdate', () => {
  it('fans out an order handoff to seller and buyer channels with stable event keys', async () => {
    const ensured: string[] = [];
    const published: Array<{ channel: string; event: string; payload: Record<string, unknown> }> = [];

    const publisher: RealtimePublisher = {
      async ensureChannel(channel: string): Promise<void> {
        ensured.push(channel);
      },
      async publish(channel: string, event: string, payload: Record<string, unknown>): Promise<void> {
        published.push({ channel, event, payload });
      },
      async issueToken(): Promise<unknown> {
        return { token: 'test-token' };
      }
    };

    const result = await broadcastMarketplaceUpdate(publisher, {
      type: 'order.handoff.ready',
      orderId: 'ord_2001',
      sellerId: 'seller_42',
      buyerId: 'buyer_9',
      handoffCode: 'handoff-4312'
    });

    expect(ensured).toEqual([
      'marketplace.seller.seller_42',
      'marketplace.buyer.buyer_9'
    ]);

    expect(result).toEqual({
      channels: ['marketplace.seller.seller_42', 'marketplace.buyer.buyer_9'],
      events: [
        'order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:seller',
        'order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:buyer'
      ]
    });

    expect(published).toEqual([
      {
        channel: 'marketplace.seller.seller_42',
        event: 'order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:seller',
        payload: {
          orderId: 'ord_2001',
          sellerId: 'seller_42',
          buyerId: 'buyer_9',
          handoffCode: 'handoff-4312',
          audience: 'seller'
        }
      },
      {
        channel: 'marketplace.buyer.buyer_9',
        event: 'order.handoff.ready:handoff-ord_2001-seller_42-buyer_9:buyer',
        payload: {
          orderId: 'ord_2001',
          sellerId: 'seller_42',
          buyerId: 'buyer_9',
          handoffCode: 'handoff-4312',
          audience: 'buyer'
        }
      }
    ]);
  });
});
