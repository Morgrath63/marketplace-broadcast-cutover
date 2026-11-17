import { broadcastMarketplaceUpdate, createInfraiRealtimePublisher, issueMarketplaceToken } from './marketplace_broadcast_service.js';

async function main(): Promise<void> {
  const publisher = createInfraiRealtimePublisher();

  const sellerAsset = await broadcastMarketplaceUpdate(publisher, {
    type: 'seller.asset.published',
    sellerId: 'seller_42',
    assetId: 'asset_7',
    title: 'Walnut coffee table'
  });

  const buyerUpdate = await broadcastMarketplaceUpdate(publisher, {
    type: 'buyer.order.updated',
    buyerId: 'buyer_9',
    orderId: 'ord_2001',
    status: 'packed'
  });

  const handoff = await broadcastMarketplaceUpdate(publisher, {
    type: 'order.handoff.ready',
    orderId: 'ord_2001',
    sellerId: 'seller_42',
    buyerId: 'buyer_9',
    handoffCode: 'handoff-4312'
  });

  const token = await issueMarketplaceToken(publisher, 'web-buyer-9', {
    buyerId: 'buyer_9'
  });

  console.log(JSON.stringify({ sellerAsset, buyerUpdate, handoff, token }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
