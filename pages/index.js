import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, Activity } from 'lucide-react';
import * as math from 'mathjs';
import { fetchStockData } from '../utils/fetchStockData';

const StockAnalysisApp = () => {
  const [allStocks, setAllStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedStocks, setSelectedStocks] = useState([]);
  const [portfolioWeights, setPortfolioWeights] = useState({});
  const [optimizedPortfolio, setOptimizedPortfolio] = useState(null);
  const [monteCarloResults, setMonteCarloResults] = useState(null);
  const [activeTab, setActiveTab] = useState('screening');
  const [loading, setLoading] = useState(true);

  // Screening criteria
  const [criteria, setCriteria] = useState({
    maxPE: 25,
    maxPB: 5,
    minROE: 10,
    minROI: 8,
    maxDebtToEquity: 1.5,
    maxPEG: 2,
    minEPS: 1
  });

  // Load stock data on component mount
  useEffect(() => {
    const loadStocks = async () => {
      setLoading(true);
      const symbols = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA',
        'TSLA', 'META', 'BRK.B', 'UNH', 'JNJ'
      ];
      const data = await fetchStockData(symbols);
      setAllStocks(data);
      setLoading(false);
    };
    loadStocks();
  }, []);

  // Filter stocks based on criteria
  useEffect(() => {
    if (loading) return;

    const filtered = allStocks.filter(stock =>
      stock.pe <= criteria.maxPE &&
      stock.pb <= criteria.maxPB &&
      stock.roe >= criteria.minROE &&
      stock.roi >= criteria.minROI &&
      stock.debtToEquity <= criteria.maxDebtToEquity &&
      stock.peg <= criteria.maxPEG &&
      stock.eps >= criteria.minEPS
    );

    // Ensure at least 4 sectors are represented
    const sectorCounts = {};
    filtered.forEach(stock => {
      sectorCounts[stock.sector] = (sectorCounts[stock.sector] || 0) + 1;
    });

    const sectorsWithStocks = Object.keys(sectorCounts).filter(sector => sectorCounts[sector] > 0);

    if (sectorsWithStocks.length >= 4) {
      // Select up to 10 stocks, ensuring sector diversity
      const topStocks = [];
      const usedSectors = new Set();

      // First, select one stock from each of the first 4 available sectors
      sectorsWithStocks.slice(0, 4).forEach(sector => {
        const sectorStocks = filtered.filter(stock => stock.sector === sector);
        if (sectorStocks.length > 0 && !usedSectors.has(sector)) {
          topStocks.push(sectorStocks[0]);
          usedSectors.add(sector);
        }
      });

      // Fill remaining spots with best performing stocks
      const remainingStocks = filtered
        .filter(stock => !topStocks.some(ts => ts.symbol === stock.symbol))
        .sort((a, b) => (b.roe + b.roi) - (a.roe + a.roi));

      for (let i = 0; topStocks.length < 10 && i < remainingStocks.length; i++) {
        topStocks.push(remainingStocks[i]);
      }

      setFilteredStocks(topStocks.slice(0, 10));
      setSelectedStocks(topStocks.slice(0, 10));
    } else {
      setFilteredStocks([]);
      setSelectedStocks([]);
    }
  }, [criteria, allStocks, loading]);

  // Technical analysis signals
  const getTechnicalSignal = (stock) => {
    const signals = [];
    
    if (stock.price > stock.sma20 && stock.sma20 > stock.sma50) {
      signals.push('MA Buy');
    } else if (stock.price < stock.sma20 && stock.sma20 < stock.sma50) {
      signals.push('MA Sell');
    }
    
    if (stock.rsi < 30) {
      signals.push('RSI Buy');
    } else if (stock.rsi > 70) {
      signals.push('RSI Sell');
    }
    
    if (stock.macd > stock.macdSignal) {
      signals.push('MACD Buy');
    } else if (stock.macd < stock.macdSignal) {
      signals.push('MACD Sell');
    }
    
    return signals;
  };

  // Portfolio metrics calculation
  const calculatePortfolioMetrics = (weights, returns) => {
    const portfolioReturns = returns.map(dayReturns => 
      dayReturns.reduce((sum, ret, i) => sum + ret * weights[i], 0)
    );
    
    const meanReturn = portfolioReturns.reduce((sum, ret) => sum + ret, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / portfolioReturns.length;
    const volatility = Math.sqrt(variance * 252);
    const annualizedReturn = meanReturn * 252;
    
    return {
      return: annualizedReturn,
      volatility,
      sharpeRatio: volatility !== 0 ? annualizedReturn / volatility : 0
    };
  };

  // Covariance matrix calculation
  const calculateCovarianceMatrix = (returnsData) => {
    if (returnsData.length === 0 || returnsData[0].length === 0) return [];

    const numStocks = returnsData[0].length;
    const numDays = returnsData.length;

    const meanReturns = Array(numStocks).fill(0);
    for (let i = 0; i < numDays; i++) {
      for (let j = 0; j < numStocks; j++) {
        meanReturns[j] += returnsData[i][j];
      }
    }
    for (let j = 0; j < numStocks; j++) {
      meanReturns[j] /= numDays;
    }

    const covarianceMatrix = Array(numStocks).fill(0).map(() => Array(numStocks).fill(0));
    for (let i = 0; i < numStocks; i++) {
      for (let j = 0; j < numStocks; j++) {
        let sumProduct = 0;
        for (let k = 0; k < numDays; k++) {
          sumProduct += (returnsData[k][i] - meanReturns[i]) * (returnsData[k][j] - meanReturns[j]);
        }
        covarianceMatrix[i][j] = sumProduct / (numDays - 1);
      }
    }
    return covarianceMatrix;
  };

  // Generate efficient frontier
  const generateEfficientFrontier = () => {
    if (selectedStocks.length === 0) return [];
    
    const returns = [];
    for (let i = 0; i < 252; i++) {
      returns.push(selectedStocks.map(stock => stock.dailyReturns[i]));
    }
    
    const frontierPoints = [];
    const numPoints = 50;
    
    for (let i = 0; i < numPoints; i++) {
      let weights = Array.from({length: selectedStocks.length}, () => Math.random());
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
      
      const metrics = calculatePortfolioMetrics(weights, returns);
      frontierPoints.push({
        risk: metrics.volatility,
        return: metrics.return,
        sharpeRatio: metrics.sharpeRatio,
        weights
      });
    }
    
    return frontierPoints.sort((a, b) => a.risk - b.risk);
  };

  // Find maximum Sharpe ratio
  const findMaxSharpeRatio = (frontierPoints) => {
    if (frontierPoints.length === 0) return null;
    return frontierPoints.reduce((max, point) => 
      point.sharpeRatio > max.sharpeRatio ? point : max
    , frontierPoints[0]);
  };

  // Monte Carlo simulation
  const runMonteCarloSimulation = (numSimulations = 10000) => {
    if (selectedStocks.length === 0) return null;
    
    const results = [];
    
    const stockDailyReturns = selectedStocks.map(stock => stock.dailyReturns);
    const transposedReturns = stockDailyReturns[0].map((_, colIndex) => 
      stockDailyReturns.map(row => row[colIndex])
    );
    
    const covMatrix = calculateCovarianceMatrix(transposedReturns);
    
    const meanDailyReturns = selectedStocks.map(stock => 
      stock.dailyReturns.reduce((sum, ret) => sum + ret, 0) / stock.dailyReturns.length
    );

    for (let i = 0; i < numSimulations; i++) {
      let weights = Array.from({length: selectedStocks.length}, () => Math.random());
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
      
      let portfolioExpectedAnnualReturn = 0;
      for (let j = 0; j < selectedStocks.length; j++) {
        portfolioExpectedAnnualReturn += weights[j] * meanDailyReturns[j] * 252;
      }

      let portfolioVariance = 0;
      for (let r = 0; r < selectedStocks.length; r++) {
        for (let c = 0; c < selectedStocks.length; c++) {
          portfolioVariance += weights[r] * weights[c] * covMatrix[r][c];
        }
      }
      const portfolioVolatility = Math.sqrt(portfolioVariance * 252);

      results.push({
        return: portfolioExpectedAnnualReturn,
        volatility: portfolioVolatility
      });
    }
    
    return results;
  };

  const efficientFrontier = useMemo(() => generateEfficientFrontier(), [selectedStocks]);
  const maxSharpePoint = useMemo(() => 
    efficientFrontier.length > 0 ? findMaxSharpeRatio(efficientFrontier) : null
  , [efficientFrontier]);

  useEffect(() => {
    if (maxSharpePoint) {
      setOptimizedPortfolio(maxSharpePoint);
      const weights = {};
      selectedStocks.forEach((stock, index) => {
        weights[stock.symbol] = maxSharpePoint.weights[index];
      });
      setPortfolioWeights(weights);
    }
  }, [maxSharpePoint, selectedStocks]);

  useEffect(() => {
    const mcResults = runMonteCarloSimulation();
    setMonteCarloResults(mcResults);
  }, [selectedStocks]);

  // Render functions for UI components
  const renderScreeningCriteria = () => (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4 flex items-center">
        <Activity className="mr-2" />
        Fundamental Analysis Screening
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Max P/E Ratio</label>
          <input
            type="number"
            value={criteria.maxPE}
            onChange={(e) => setCriteria({...criteria, maxPE: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max P/B Ratio</label>
          <input
            type="number"
            value={criteria.maxPB}
            onChange={(e) => setCriteria({...criteria, maxPB: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Min Return on Equity (ROE) (%)</label>
          <input
            type="number"
            value={criteria.minROE}
            onChange={(e) => setCriteria({...criteria, minROE: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Min Return on Investment (ROI) (%)</label>
          <input
            type="number"
            value={criteria.minROI}
            onChange={(e) => setCriteria({...criteria, minROI: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Debt-to-Equity Ratio</label>
          <input
            type="number"
            step="0.1"
            value={criteria.maxDebtToEquity}
            onChange={(e) => setCriteria({...criteria, maxDebtToEquity: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max PEG Ratio</label>
          <input
            type="number"
            step="0.1"
            value={criteria.maxPEG}
            onChange={(e) => setCriteria({...criteria, maxPEG: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Min Earnings Per Share (EPS)</label>
          <input
            type="number"
            step="0.1"
            value={criteria.minEPS}
            onChange={(e) => setCriteria({...criteria, minEPS: parseFloat(e.target.value) || 0})}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
    </div>
  );

  const renderFilteredStocks = () => (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text
