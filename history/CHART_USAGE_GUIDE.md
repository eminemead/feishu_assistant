# Chart Generation Tool Usage Guide

## Overview

The chart generation tool enables agents to create **streamable charts** for Feishu cards using two powerful frameworks:

1. **Mermaid** - Text-based diagrams (flows, timelines, hierarchies)
2. **Vega-Lite** - Data-driven visualizations (bar, line, scatter, etc.)

Both output as **markdown code blocks** that stream in real-time to Feishu.

---

## Quick Start

### For Agents (AI Assistants)

The `chartGenerationTool` is automatically available in your agent environment. Call it like:

```typescript
// Mermaid flowchart
const flowchart = await chartGenerationTool({
  chartType: 'mermaid',
  subType: 'flowchart',
  title: 'Authentication Flow',
  description: 'How users log in',
  data: {
    steps: [
      { id: 'start', label: 'User Enters Credentials' },
      { id: 'validate', label: 'Validate Credentials', shape: 'diamond' },
      { id: 'success', label: 'Login Success' },
    ],
    connections: [
      { from: 'start', to: 'validate' },
      { from: 'validate', to: 'success', label: 'Valid' },
    ],
  },
});

// Returns markdown with embedded mermaid diagram
// Response: markdown property contains ```mermaid\n...diagram...\n```
```

### For Developers (Integration)

To use the tool in your code:

```typescript
import { chartGenerationTool } from './lib/tools/chart-generation-tool';

// Generate any chart
const response = await chartGenerationTool.execute({
  chartType: 'vega-lite',
  subType: 'bar',
  title: 'Sales Data',
  description: 'Q1 sales by region',
  data: [
    { category: 'North', value: 28000 },
    { category: 'South', value: 35000 },
  ],
});

console.log(response.markdown); // Ready to stream!
```

---

## Chart Types

### MERMAID DIAGRAMS (Text-Based)

#### Flowchart - Process flows and decision trees

```json
{
  "chartType": "mermaid",
  "subType": "flowchart",
  "title": "Approval Workflow",
  "description": "How requests are approved",
  "data": {
    "steps": [
      { "id": "req", "label": "Submit Request" },
      { "id": "review", "label": "Manager Review", "shape": "diamond" },
      { "id": "approve", "label": "Approved" },
      { "id": "reject", "label": "Rejected" }
    ],
    "connections": [
      { "from": "req", "to": "review" },
      { "from": "review", "to": "approve", "label": "Yes" },
      { "from": "review", "to": "reject", "label": "No" }
    ]
  },
  "options": {
    "direction": "TB"  // TB, LR, BT, RL
  }
}
```

**Shape options**: `rectangle`, `diamond`, `rounded`, `circle`

#### Timeline - Events and milestones

```json
{
  "chartType": "mermaid",
  "subType": "timeline",
  "title": "Product Roadmap",
  "description": "Key milestones for 2024",
  "data": [
    { "date": "2024-Q1", "event": "Alpha Release" },
    { "date": "2024-Q2", "event": "Beta Testing" },
    { "date": "2024-Q3", "event": "Public Launch" }
  ]
}
```

#### Pie Chart - Composition and percentages

```json
{
  "chartType": "mermaid",
  "subType": "pie",
  "title": "User Distribution",
  "description": "Users by region",
  "data": {
    "USA": 45,
    "Europe": 30,
    "Asia": 20,
    "Other": 5
  }
}
```

#### Hierarchy - Org charts, taxonomies

```json
{
  "chartType": "mermaid",
  "subType": "hierarchy",
  "title": "Engineering Organization",
  "description": "Team structure",
  "data": {
    "root": "Engineering",
    "nodes": [
      { "id": "frontend", "label": "Frontend Team" },
      { "id": "backend", "label": "Backend Team" },
      { "id": "devops", "label": "DevOps Team" }
    ]
  }
}
```

#### Sequence Diagram - API calls, system interactions

```json
{
  "chartType": "mermaid",
  "subType": "sequence",
  "title": "API Request Flow",
  "description": "How the system handles requests",
  "data": {
    "actors": ["Client", "API", "Database"],
    "interactions": [
      { "from": "Client", "to": "API", "message": "GET /users" },
      { "from": "API", "to": "Database", "message": "SELECT * FROM users" },
      { "from": "Database", "to": "API", "message": "User data", "type": "response" }
    ]
  }
}
```

#### Mindmap - Brainstorming, concepts

```json
{
  "chartType": "mermaid",
  "subType": "mindmap",
  "title": "Product Strategy",
  "description": "Strategic thinking",
  "data": {
    "Product": ["Features", "UX", "Performance"],
    "Marketing": ["Content", "Community", "Partnerships"],
    "Engineering": ["Architecture", "DevOps", "QA"]
  },
  "options": {
    "emoji": true
  }
}
```

#### Architecture - System design, components

```json
{
  "chartType": "mermaid",
  "subType": "architecture",
  "title": "Microservices Architecture",
  "description": "System design",
  "data": {
    "components": [
      { "id": "api", "name": "API Gateway" },
      { "id": "auth", "name": "Auth Service" },
      { "id": "db", "name": "Database", "type": "database" }
    ],
    "connections": [
      { "from": "api", "to": "auth", "label": "authenticates" },
      { "from": "auth", "to": "db", "label": "queries" }
    ]
  }
}
```

#### Gantt Chart - Project timeline

```json
{
  "chartType": "mermaid",
  "subType": "gantt",
  "title": "Sprint Planning",
  "description": "Development schedule",
  "data": [
    { "id": "design", "title": "Design Phase", "start": "2024-01-01", "duration": 10, "status": "done" },
    { "id": "dev", "title": "Development", "start": "2024-01-11", "duration": 20, "status": "active" },
    { "id": "test", "title": "Testing", "start": "2024-01-31", "duration": 10, "status": "crit" }
  ]
}
```

#### State Diagram - State machines

```json
{
  "chartType": "mermaid",
  "subType": "state",
  "title": "Order Status Flow",
  "description": "How orders progress",
  "data": {
    "states": ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
    "transitions": [
      { "from": "Pending", "to": "Processing", "event": "confirmed" },
      { "from": "Processing", "to": "Shipped", "event": "shipped" },
      { "from": "Pending", "to": "Cancelled", "event": "cancel" }
    ]
  },
  "options": {
    "initialState": "Pending",
    "finalState": "Delivered"
  }
}
```

#### Class Diagram - OOP design

```json
{
  "chartType": "mermaid",
  "subType": "class",
  "title": "User Management System",
  "description": "Class relationships",
  "data": {
    "classes": [
      {
        "name": "User",
        "attributes": [
          { "name": "id", "type": "string" },
          { "name": "email", "type": "string" }
        ],
        "methods": [
          { "name": "authenticate", "returnType": "boolean" },
          { "name": "logout" }
        ]
      }
    ]
  }
}
```

---

### VEGA-LITE CHARTS (Data-Driven)

#### Bar Chart

```json
{
  "chartType": "vega-lite",
  "subType": "bar",
  "title": "Q1 Sales by Region",
  "description": "Regional performance",
  "data": [
    { "category": "North", "value": 28000 },
    { "category": "South", "value": 35000 },
    { "category": "East", "value": 42000 },
    { "category": "West", "value": 38000 }
  ],
  "options": {
    "width": 500,
    "height": 300,
    "orientation": "vertical",
    "xLabel": "Region",
    "yLabel": "Sales"
  }
}
```

#### Line Chart - Time series

```json
{
  "chartType": "vega-lite",
  "subType": "line",
  "title": "Monthly Active Users",
  "description": "User growth trend",
  "data": [
    { "x": "2024-01", "y": 1000 },
    { "x": "2024-02", "y": 1200 },
    { "x": "2024-03", "y": 1500 },
    { "x": "2024-04", "y": 1800 }
  ],
  "options": {
    "xType": "temporal",
    "xLabel": "Month",
    "yLabel": "Users"
  }
}
```

#### Area Chart - Stacked trends

```json
{
  "chartType": "vega-lite",
  "subType": "area",
  "title": "Revenue Streams",
  "description": "Revenue by source over time",
  "data": [
    { "x": "2024-01", "y": 10000, "category": "Direct Sales" },
    { "x": "2024-01", "y": 5000, "category": "Partnerships" },
    { "x": "2024-02", "y": 12000, "category": "Direct Sales" }
  ],
  "options": {
    "stacked": true
  }
}
```

#### Scatter Plot - Correlation

```json
{
  "chartType": "vega-lite",
  "subType": "scatter",
  "title": "Product Price vs. Reviews",
  "description": "Price correlation with review score",
  "data": [
    { "x": 29.99, "y": 4.5, "group": "Category A" },
    { "x": 49.99, "y": 4.2, "group": "Category A" },
    { "x": 19.99, "y": 3.8, "group": "Category B" }
  ],
  "options": {
    "xLabel": "Price ($)",
    "yLabel": "Avg Rating"
  }
}
```

#### Pie Chart

```json
{
  "chartType": "vega-lite",
  "subType": "pie",
  "title": "Market Share",
  "description": "Competitor comparison",
  "data": [
    { "label": "Company A", "value": 35 },
    { "label": "Company B", "value": 25 },
    { "label": "Company C", "value": 20 },
    { "label": "Others", "value": 20 }
  ]
}
```

#### Heatmap - Matrix visualization

```json
{
  "chartType": "vega-lite",
  "subType": "heatmap",
  "title": "API Response Times",
  "description": "Response times by endpoint and hour",
  "data": [
    { "row": "GET /users", "column": "10:00", "value": 45 },
    { "row": "GET /users", "column": "11:00", "value": 52 },
    { "row": "POST /users", "column": "10:00", "value": 78 }
  ]
}
```

#### Histogram - Distribution

```json
{
  "chartType": "vega-lite",
  "subType": "histogram",
  "title": "Order Value Distribution",
  "description": "How orders are distributed by value",
  "data": [
    { "value": 29.99 },
    { "value": 49.99 },
    { "value": 99.99 },
    { "value": 45.50 }
  ],
  "options": {
    "bins": 20
  }
}
```

#### Box Plot - Statistical distribution

```json
{
  "chartType": "vega-lite",
  "subType": "boxplot",
  "title": "Performance Metrics",
  "description": "Response time distribution by endpoint",
  "data": [
    { "category": "Endpoint A", "value": 45 },
    { "category": "Endpoint A", "value": 52 },
    { "category": "Endpoint B", "value": 78 }
  ]
}
```

#### Bubble Chart - Multi-dimensional

```json
{
  "chartType": "vega-lite",
  "subType": "bubble",
  "title": "Product Portfolio Analysis",
  "description": "Price vs demand vs market size",
  "data": [
    { "x": 29.99, "y": 1000, "size": 50, "label": "Product A", "group": "Type 1" },
    { "x": 49.99, "y": 2000, "size": 80, "label": "Product B", "group": "Type 1" }
  ],
  "options": {
    "xLabel": "Price",
    "yLabel": "Units Sold"
  }
}
```

#### Waterfall Chart - Cumulative effect

```json
{
  "chartType": "vega-lite",
  "subType": "waterfall",
  "title": "P&L Statement",
  "description": "Revenue breakdown",
  "data": [
    { "label": "Sales", "value": 100000 },
    { "label": "COGS", "value": -45000 },
    { "label": "Operating Expense", "value": -25000 }
  ]
}
```

---

## Streaming Behavior

### How Charts Stream in Feishu

1. **Agent generates chart** via `chartGenerationTool`
2. **Markdown is returned** with chart definition embedded
3. **Markdown streams** to Feishu card in real-time (typewriter effect)
4. **User sees chart definition** appearing progressively
5. **Client renders** the chart (Mermaid natively, Vega-Lite if runtime available)

### Example Response

```markdown
Here's the analysis I've completed:

## Customer Distribution

Based on your data, here's how customers break down:

\`\`\`mermaid
pie title Customer Distribution
  "Enterprise": 35
  "Mid-Market": 40
  "Startup": 25
\`\`\`

Key insights:
- Mid-market is our largest segment
- Enterprise accounts for significant value
- Startup segment growing rapidly
```

This entire response streams to the user in real-time.

---

## Best Practices

### 1. Choose the Right Chart Type

| Use Case | Best Chart Type |
|----------|-----------------|
| Process flows | Mermaid flowchart |
| Project schedules | Mermaid gantt or timeline |
| System architecture | Mermaid architecture |
| Sales trends | Vega-Lite line chart |
| Regional comparisons | Vega-Lite bar chart |
| Market composition | Mermaid pie or Vega-Lite pie |
| Correlations | Vega-Lite scatter |
| Distributions | Vega-Lite histogram/boxplot |

### 2. Provide Context

Always include:
- **title** - What is this chart about?
- **description** - Why should users care?
- Surrounding **text** explaining the insight

```markdown
Our analysis shows a clear trend:

[Chart appears here via streaming]

This indicates strong growth in Q3 with a slight dip in Q4.
```

### 3. Keep Data Clean

- Remove outliers if they make the chart unreadable
- Use consistent naming conventions
- Provide labels that are self-explanatory

### 4. Optimize for Feishu

- **Width**: Keep <= 500px (Feishu cards have width constraints)
- **Height**: 300px is good default
- **Colors**: Use contrasting colors for accessibility
- **Labels**: Make axes/categories clear

### 5. Use Markdown for Annotations

```markdown
## Analysis Results

Key finding: Q3 had highest revenue ($125K)

\`\`\`mermaid
[Chart here]
\`\`\`

This represents a 45% increase over Q2 performance.
```

---

## Common Patterns

### Pattern 1: Analysis with Charts

```
[Introduction and key insight]
→ Chart illustrating the insight
→ Detailed explanation
→ Call to action
```

### Pattern 2: Comparison Charts

Show multiple perspectives:

```
Product A vs B comparison:

[Bar chart showing feature comparison]

By adoption:

[Line chart showing growth over time]

By customer satisfaction:

[Scatter plot showing price vs rating]
```

### Pattern 3: Process Flow + Outcomes

```
Here's how the system works:

[Flowchart showing the process]

Results:
- 45% faster processing
- 20% cost reduction
- Better user experience
```

---

## Troubleshooting

### Chart Not Rendering

1. Check that `chartType` and `subType` match exactly
2. Verify data format matches the expected structure
3. Ensure all required fields are provided
4. Check browser console for Mermaid/Vega-Lite errors

### Mermaid Not Rendering in Feishu

- Feishu may not have Mermaid support natively
- **Fallback**: Use Vega-Lite or ASCII art instead
- **Alternative**: Use image rendering service (Kroki.io)

### Vega-Lite Charts Need Rendering

- Vega-Lite specs are JSON - they need a runtime to render
- **Option 1**: Send as image (use Vega rendering service)
- **Option 2**: Provide text description + chart definition

---

## API Reference

### chartGenerationTool

```typescript
interface ChartRequest {
  chartType: 'mermaid' | 'vega-lite';
  subType: string;  // Specific chart type
  title: string;    // Chart title
  description: string;  // Purpose
  data?: any;       // Chart data
  options?: Record<string, any>;  // Additional options
}

interface ChartResponse {
  success: boolean;
  markdown: string;  // Ready to stream
  type: string;
  subType: string;
  title: string;
  description: string;
  rendererHint: string;
  streamable: boolean;  // Always true
}
```

---

## Next Steps

1. Integrate `chartGenerationTool` into your agent
2. Add chart generation to response generation flow
3. Test with sample data
4. Optimize chart styling for Feishu
5. Consider image rendering fallback for Vega-Lite
