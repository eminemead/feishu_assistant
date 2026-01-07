#!/usr/bin/env bun
/**
 * Test Datawrapper Integration
 * 
 * Run with: bun scripts/test-datawrapper.ts
 * 
 * Requires DATAWRAPPER_API_KEY in .env
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  hasDatawrapperConfig,
  generateBarChart,
  generatePieChart,
  generateLineChart,
  generateOKRCompanyChart,
  generateChartImage,
} from '../lib/visualization/datawrapper';

async function main() {
  console.log('='.repeat(60));
  console.log('Datawrapper API Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Check config
  if (!hasDatawrapperConfig()) {
    console.error('❌ DATAWRAPPER_API_KEY not set in environment');
    console.log('\nTo configure:');
    console.log('1. Get API key from: https://app.datawrapper.de/account/api-tokens');
    console.log('2. Add to .env: DATAWRAPPER_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log('✅ Datawrapper API key found\n');

  // Create output directory
  const outputDir = path.join(process.cwd(), 'test-output');
  await fs.mkdir(outputDir, { recursive: true });

  // Test 1: Simple bar chart
  console.log('📊 Test 1: Bar Chart (Column)');
  console.log('-'.repeat(40));
  try {
    const barData = [
      { label: 'Shanghai', value: 92 },
      { label: 'Beijing', value: 78 },
      { label: 'Guangzhou', value: 65 },
      { label: 'Shenzhen', value: 54 },
      { label: 'Hangzhou', value: 45 },
    ];

    const barPng = await generateBarChart(barData, {
      title: 'Company Performance (%)',
      horizontal: false,
    });

    const barPath = path.join(outputDir, 'datawrapper-bar.png');
    await fs.writeFile(barPath, barPng);
    console.log(`✅ Saved to: ${barPath} (${barPng.length} bytes)\n`);
  } catch (error) {
    console.error('❌ Bar chart failed:', error);
  }

  // Test 2: Horizontal bar chart
  console.log('📊 Test 2: Horizontal Bar Chart');
  console.log('-'.repeat(40));
  try {
    const hbarData = [
      { label: 'Revenue Metrics', value: 85 },
      { label: 'Conversion Rate', value: 72 },
      { label: 'Customer NPS', value: 68 },
      { label: 'Retention', value: 55 },
    ];

    const hbarPng = await generateBarChart(hbarData, {
      title: 'OKR Coverage by Metric Type',
      horizontal: true,
    });

    const hbarPath = path.join(outputDir, 'datawrapper-hbar.png');
    await fs.writeFile(hbarPath, hbarPng);
    console.log(`✅ Saved to: ${hbarPath} (${hbarPng.length} bytes)\n`);
  } catch (error) {
    console.error('❌ Horizontal bar chart failed:', error);
  }

  // Test 3: Pie chart
  console.log('📊 Test 3: Donut Chart');
  console.log('-'.repeat(40));
  try {
    const pieData = [
      { label: 'Revenue', value: 35 },
      { label: 'Conversion', value: 25 },
      { label: 'Retention', value: 20 },
      { label: 'NPS', value: 15 },
      { label: 'Other', value: 5 },
    ];

    const piePng = await generatePieChart(pieData, {
      title: 'Metric Distribution',
      donut: true,
    });

    const piePath = path.join(outputDir, 'datawrapper-pie.png');
    await fs.writeFile(piePath, piePng);
    console.log(`✅ Saved to: ${piePath} (${piePng.length} bytes)\n`);
  } catch (error) {
    console.error('❌ Pie chart failed:', error);
  }

  // Test 4: Line chart
  console.log('📊 Test 4: Line Chart');
  console.log('-'.repeat(40));
  try {
    const lineData = [
      { x: 'Jan', y: 45 },
      { x: 'Feb', y: 52 },
      { x: 'Mar', y: 48 },
      { x: 'Apr', y: 65 },
      { x: 'May', y: 72 },
      { x: 'Jun', y: 68 },
      { x: 'Jul', y: 78 },
      { x: 'Aug', y: 85 },
    ];

    const linePng = await generateLineChart(lineData, {
      title: 'OKR Coverage Trend',
    });

    const linePath = path.join(outputDir, 'datawrapper-line.png');
    await fs.writeFile(linePath, linePng);
    console.log(`✅ Saved to: ${linePath} (${linePng.length} bytes)\n`);
  } catch (error) {
    console.error('❌ Line chart failed:', error);
  }

  // Test 5: OKR-specific chart
  console.log('📊 Test 5: OKR Company Chart');
  console.log('-'.repeat(40));
  try {
    const okrData = [
      { company: '上海总部', value: 92.5 },
      { company: '北京分公司', value: 78.3 },
      { company: '广州分公司', value: 65.0 },
      { company: '深圳分公司', value: 54.2 },
      { company: '杭州分公司', value: 45.8 },
    ];

    const okrPng = await generateOKRCompanyChart(okrData, '10 月');

    const okrPath = path.join(outputDir, 'datawrapper-okr.png');
    await fs.writeFile(okrPath, okrPng);
    console.log(`✅ Saved to: ${okrPath} (${okrPng.length} bytes)\n`);
  } catch (error) {
    console.error('❌ OKR chart failed:', error);
  }

  console.log('='.repeat(60));
  console.log(`✅ All tests complete! Check ${outputDir} for output files.`);
  console.log('='.repeat(60));
}

main().catch(console.error);
