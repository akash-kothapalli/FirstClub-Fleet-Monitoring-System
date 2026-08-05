const rateLimitMap = new Map();

export function createRateLimiter(windowMs, maxRequests, message) {
  return (req, res, next) => {
    const key = `${req.ip}_${req.user?.userId || 'anon'}_${req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + windowMs;
    } else {
      entry.count++;
    }

    rateLimitMap.set(key, entry);

    if (entry.count > maxRequests) {
      return res.status(429).json({ error: message || 'Too many requests' });
    }

    next();
  };
}

export const livePingLimiter = createRateLimiter(3000, 1, 'Max 1 live ping per 3 seconds');
export const batchPingLimiter = createRateLimiter(60000, 5, 'Max 5 bulk offline syncs per minute');
