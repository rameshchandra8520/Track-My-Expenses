import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;
let isConnected = false;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: true, // for Upstash or other TLS-enabled Redis
        reconnectStrategy: retries => Math.min(retries * 100, 2000),
      },
    });

    redisClient.on('error', err => {
      console.error('Redis Client Error', err);
    });
  }

  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }

  return redisClient;
}
