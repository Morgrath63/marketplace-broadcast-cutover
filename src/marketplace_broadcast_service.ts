import { z } from 'zod';
import { infrai } from './infrai_client.js';

const sellerAssetPublishedSchema = z.object({
  type: z.literal('seller.asset.published'),
  sellerId: z.string().min(1),
  assetId: z.string().min(1),
  title: z.string().min(1)
});

const buyerOrderUpdatedSchema = z.object({
  type: z.literal('buyer.order.updated'),
  buyerId: z.string().min(1),
  orderId: z.string().min(1),
  status: z.enum(['paid', 'packed', 'shipped'])
});

const orderHandoffReadySchema = z.object({
  type: z.literal('order.handoff.ready'),
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  handoffCode: z.string().min(1)
});

export const marketplaceBroadcastSchema = z.discriminatedUnion('type', [
  sellerAssetPublishedSchema,
  buyerOrderUpdatedSchema,
  orderHandoffReadySchema
]);

export type MarketplaceBroadcastInput = z.infer<typeof marketplaceBroadcastSchema>;

export type BroadcastResult = {
  channels: string[];
  events: string[];
};

export type RealtimePublisher = {
  ensureChannel(channel: string): Promise<void>;
  publish(channel: string, event: string, payload: Record<string, unknown>): Promise<void>;
  issueToken(clientId: string, channels: string[]): Promise<unknown>;
};

export function createInfraiRealtimePublisher(): RealtimePublisher {
  return {
    async ensureChannel(channel: string): Promise<void> {
      // Channels are intentionally not created by the demo: the API exposes no
      // deletion route, so creating named persistent channels cannot be cleaned up.
      void channel;
    },
    async publish(channel: string, event: string, payload: Record<string, unknown>): Promise<void> {
      await infrai.realtime.publish({
        channel,
        event,
        data: JSON.stringify(payload)
      });
    },
    async issueToken(clientId: string, channels: string[]): Promise<unknown> {
      const result = await infrai.realtime.token.issue({
        client_id: clientId,
        channels,
        capabilities: ['subscribe'],
        ttl_seconds: 3600
      });
      return result.data;
    }
  };
}

function sellerChannel(sellerId: string): string {
  return `marketplace.seller.${sellerId}`;
}

function buyerChannel(buyerId: string): string {
  return `marketplace.buyer.${buyerId}`;
}

function handoffEventKey(orderId: string, sellerId: string, buyerId: string): string {
  return `handoff-${orderId}-${sellerId}-${buyerId}`;
}

export async function ensureMarketplaceChannels(
  publisher: RealtimePublisher,
  input: MarketplaceBroadcastInput
): Promise<string[]> {
  const channels = resolveChannels(input);
  for (const channel of channels) {
    await publisher.ensureChannel(channel);
  }
  return channels;
}

export async function broadcastMarketplaceUpdate(
  publisher: RealtimePublisher,
  body: unknown
): Promise<BroadcastResult> {
  const input = marketplaceBroadcastSchema.parse(body);
  const channels = await ensureMarketplaceChannels(publisher, input);

  if (input.type === 'seller.asset.published') {
    const event = `seller.asset.published:asset-${input.assetId}`;
    await publisher.publish(channels[0], event, {
      sellerId: input.sellerId,
      assetId: input.assetId,
      title: input.title
    });
    return { channels, events: [event] };
  }

  if (input.type === 'buyer.order.updated') {
    const event = `buyer.order.updated:order-${input.orderId}`;
    await publisher.publish(channels[0], event, {
      buyerId: input.buyerId,
      orderId: input.orderId,
      status: input.status
    });
    return { channels, events: [event] };
  }

  const key = handoffEventKey(input.orderId, input.sellerId, input.buyerId);
  const sellerEvent = `order.handoff.ready:${key}:seller`;
  const buyerEvent = `order.handoff.ready:${key}:buyer`;

  await publisher.publish(channels[0], sellerEvent, {
    orderId: input.orderId,
    sellerId: input.sellerId,
    buyerId: input.buyerId,
    handoffCode: input.handoffCode,
    audience: 'seller'
  });

  await publisher.publish(channels[1], buyerEvent, {
    orderId: input.orderId,
    sellerId: input.sellerId,
    buyerId: input.buyerId,
    handoffCode: input.handoffCode,
    audience: 'buyer'
  });

  return { channels, events: [sellerEvent, buyerEvent] };
}

export async function issueMarketplaceToken(
  publisher: RealtimePublisher,
  clientId: string,
  viewer: { sellerId?: string; buyerId?: string }
): Promise<unknown> {
  const channels: string[] = [];
  if (viewer.sellerId) {
    channels.push(sellerChannel(viewer.sellerId));
  }
  if (viewer.buyerId) {
    channels.push(buyerChannel(viewer.buyerId));
  }
  return publisher.issueToken(clientId, channels);
}

function resolveChannels(input: MarketplaceBroadcastInput): string[] {
  if (input.type === 'seller.asset.published') {
    return [sellerChannel(input.sellerId)];
  }
  if (input.type === 'buyer.order.updated') {
    return [buyerChannel(input.buyerId)];
  }
  return [sellerChannel(input.sellerId), buyerChannel(input.buyerId)];
}
