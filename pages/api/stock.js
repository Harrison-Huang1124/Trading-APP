import axios from "axios";

export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "No symbol specified" });

  try {
    // Fetch real-time quote data
    const quoteResult = await axios.get(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`
    );
    const quoteData = quoteResult.data.quoteResponse.result[0];

    // Fetch historical data for technical analysis
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;
    const historicalResult = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d`
    );
    const historicalData = historicalResult.data.chart.result[0];

    // Calculate technical indicators
    const prices = historicalData.indicators.quote[0].close;
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const rsi = calculateRSI(prices);
    const macdData = calculateMACD(prices);

    // Prepare daily returns for portfolio analysis
    const dailyReturns = calculateDailyReturns(prices);

    res.status(200).json({
      // Basic info
      symbol: quoteData.symbol,
      name: quoteData.shortName,
      sector: quoteData.sector || "",
      price: quoteData.regularMarketPrice,
      
      // Fundamental metrics
      pe: quoteData.trailingPE,
      pb: quoteData.priceToBook,
      eps: quoteData.epsTrailingTwelveMonths,
      roi: quoteData.returnOnEquity,
      roe: quoteData.returnOnAssets,
      debtToEquity: quoteData.debtToEquity,
      volume: quoteData.regularMarketVolume,
      marketCap: quoteData.marketCap,
      
      // Technical indicators
      sma20: sma20[sma20.length - 1],
      sma50: sma50[sma50.length - 1],
      rsi: rsi[rsi.length - 1],
      macd: macdData.macd[macdData.macd.length - 1],
      macdSignal: macdData.signal[macdData.signal.length - 1],
      
      // Historical data
      dailyReturns: dailyReturns,
      historicalPrices: prices
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}

// Technical Analysis Helper Functions
function calculateSMA(prices, period) {
  const sma = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function calculateRSI(prices, period = 14) {
  const rsi = [];
  const gains = [];
  const losses = [];

  for (let i = 1; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    gains.push(Math.max(difference, 0));
    losses.push(Math.max(-difference, 0));

    if (i < period) {
      rsi.push(null);
      continue;
    }

    const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b) / period;
    
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }

  return rsi;
}

function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const ema12 = calculateEMA(prices, fastPeriod);
  const ema26 = calculateEMA(prices, slowPeriod);
  
  const macdLine = ema12.map((fast, i) => {
    if (!fast || !ema26[i]) return null;
    return fast - ema26[i];
  });

  const signalLine = calculateEMA(macdLine.filter(x => x !== null), signalPeriod);
  
  return {
    macd: macdLine,
    signal: signalLine
  };
}

function calculateEMA(prices, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ema.push(null);
      continue;
    }
    if (i === period - 1) {
      const sma = prices.slice(0, period).reduce((a, b) => a + b) / period;
      ema.push(sma);
      continue;
    }
    ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }

  return ema;
}

function calculateDailyReturns(prices) {
  return prices.map((price, index) => {
    if (index === 0) return 0;
    return (price - prices[index - 1]) / prices[index - 1];
  });
}
