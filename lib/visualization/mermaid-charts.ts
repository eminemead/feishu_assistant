/**
 * Mermaid Chart Builders - Create diagrams as markdown for streaming in Feishu cards
 * Reference: https://mermaid.js.org/intro/
 *
 * Mermaid is perfect for Feishu because:
 * 1. Text-based syntax (fully streamable)
 * 2. Renders in markdown code blocks
 * 3. Native support in many platforms
 * 4. No external API calls needed
 */

export interface MermaidChart {
  markdown: string;
  description: string;
  type: string;
}

/**
 * Flowchart builder - for processes, workflows, decision trees
 */
export function createFlowchart(
  steps: Array<{
    id: string;
    label: string;
    shape?: 'rectangle' | 'diamond' | 'rounded' | 'circle';
    style?: string;
  }>,
  connections: Array<{ from: string; to: string; label?: string }>,
  options?: {
    direction?: 'TB' | 'LR' | 'BT' | 'RL'; // Top-Bottom, Left-Right, etc.
    title?: string;
  }
): MermaidChart {
  const direction = options?.direction || 'TB';
  const title = options?.title ? `\ntitle ${options.title}\n` : '';

  // Shape mapping
  const shapeMap: Record<string, [string, string]> = {
    rectangle: ['[', ']'],
    diamond: ['{', '}'],
    rounded: ['(', ')'],
    circle: ['((', '))'],
  };

  let mermaid = `\`\`\`mermaid\nflowchart ${direction}${title}`;

  // Add nodes
  steps.forEach((step) => {
    const shape = step.shape || 'rectangle';
    const [open, close] = shapeMap[shape];
    const styleStr = step.style ? `\n  style ${step.id} ${step.style}` : '';
    mermaid += `\n  ${step.id}${open}${step.label}${close}${styleStr}`;
  });

  // Add connections
  connections.forEach((conn) => {
    const label = conn.label ? `|${conn.label}|` : '';
    mermaid += `\n  ${conn.from} --${label}--> ${conn.to}`;
  });

  mermaid += '\n\`\`\`';

  return {
    markdown: mermaid,
    description: 'Flowchart showing process steps and decision paths',
    type: 'flowchart',
  };
}

/**
 * Timeline builder - for events, milestones, project schedules
 */
export function createTimeline(
  events: Array<{
    date: string;
    event: string;
    color?: 'success' | 'info' | 'warning' | 'error';
  }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `title ${options.title}\n` : '';

  let mermaid = `\`\`\`mermaid\ntimeline${title}`;

  events.forEach((e) => {
    mermaid += `\n  ${e.date} : ${e.event}`;
  });

  mermaid += '\n\`\`\`';

  return {
    markdown: mermaid,
    description: 'Timeline showing events and milestones',
    type: 'timeline',
  };
}

/**
 * Pie chart builder - for composition, market share, distribution
 */
export function createPieChart(
  data: Array<{ label: string; value: number }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `pie title ${options.title}\n` : 'pie\n';

  let mermaid = `\`\`\`mermaid\n${title}`;

  data.forEach((item) => {
    const percentage = Math.round(item.value);
    mermaid += `  "${item.label}" : ${percentage}\n`;
  });

  mermaid = mermaid.trimEnd() + '\n\`\`\`';

  return {
    markdown: mermaid,
    description: 'Pie chart showing composition and distribution',
    type: 'pie',
  };
}

/**
 * Hierarchy chart - for org structures, taxonomies, category trees
 */
export function createHierarchy(
  root: string,
  nodes: Array<{
    id: string;
    label: string;
    parent?: string; // if undefined, connects to root
  }>,
  options?: { title?: string; direction?: 'TB' | 'LR' }
): MermaidChart {
  const direction = options?.direction || 'TB';
  const title = options?.title ? `\ntitle ${options.title}` : '';

  let mermaid = `\`\`\`mermaid\ngraph ${direction}${title}\n`;

  // Add root
  mermaid += `  root["<b>${root}</b>"]\n`;

  // Add nodes
  nodes.forEach((node) => {
    mermaid += `  ${node.id}["${node.label}"]\n`;
  });

  // Add connections
  nodes.forEach((node) => {
    const parent = node.parent || 'root';
    mermaid += `  ${parent} --> ${node.id}\n`;
  });

  mermaid += '\`\`\`';

  return {
    markdown: mermaid,
    description: 'Hierarchy chart showing organizational or category structure',
    type: 'hierarchy',
  };
}

/**
 * Sequence diagram - for API calls, interactions, workflows
 */
export function createSequenceDiagram(
  actors: string[],
  interactions: Array<{
    from: string;
    to: string;
    message: string;
    type?: 'sync' | 'async' | 'response';
  }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `\nautonumber\n` : '';

  let mermaid = `\`\`\`mermaid\nsequenceDiagram${title}`;

  // Add participants
  actors.forEach((actor) => {
    mermaid += `\n  participant ${actor}`;
  });

  // Add interactions
  interactions.forEach((interaction) => {
    const arrow =
      interaction.type === 'async' ? '-)' : interaction.type === 'response' ? '-->' : '->';
    mermaid += `\n  ${interaction.from} ${arrow} ${interaction.to}: ${interaction.message}`;
  });

  mermaid += '\n\`\`\`';

  return {
    markdown: mermaid,
    description: 'Sequence diagram showing interactions and message flows',
    type: 'sequence',
  };
}

/**
 * Mindmap - for brainstorming, knowledge structure, hierarchical concepts
 */
export function createMindmap(
  root: string,
  branches: Record<string, string[]>,
  options?: { emoji?: boolean }
): MermaidChart {
  let mermaid = `\`\`\`mermaid\nmindmap\n  root((${root}))`;

  Object.entries(branches).forEach(([branch, items]) => {
    mermaid += `\n    ${branch}`;
    items.forEach((item) => {
      const indent = item.startsWith('🔹') ? '      ' : '      ';
      mermaid += `\n${indent}${item}`;
    });
  });

  mermaid += '\n\`\`\`';

  return {
    markdown: mermaid,
    description: 'Mindmap for hierarchical concept organization',
    type: 'mindmap',
  };
}

/**
 * Architecture diagram - for system design, component relationships
 */
export function createArchitecture(
  components: Array<{
    id: string;
    name: string;
    type?: 'service' | 'database' | 'client' | 'queue';
  }>,
  connections: Array<{
    from: string;
    to: string;
    label?: string;
  }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `\ntitle ${options.title}` : '';

  let mermaid = `\`\`\`mermaid\ngraph LR${title}\n`;

  // Add components with styling based on type
  components.forEach((comp) => {
    const shape = comp.type === 'database' ? '[(db)]' : comp.type === 'queue' ? '([queue])' : '[]';
    mermaid += `  ${comp.id}["${comp.name}"]${comp.type ? ` style ${comp.id} fill:#e8f4f8` : ''}\n`;
  });

  // Add connections
  connections.forEach((conn) => {
    const label = conn.label ? `|${conn.label}|` : '';
    mermaid += `  ${conn.from} --${label}--> ${conn.to}\n`;
  });

  mermaid += '\`\`\`';

  return {
    markdown: mermaid,
    description: 'Architecture diagram showing system components and interactions',
    type: 'architecture',
  };
}

/**
 * Gantt chart - for project timelines, schedules, milestones
 */
export function createGanttChart(
  tasks: Array<{
    id: string;
    title: string;
    start: string; // ISO date or relative
    duration?: number; // days
    status?: 'active' | 'done' | 'crit' | 'milestone';
    dependencies?: string[]; // task ids
  }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `\ntitle ${options.title}` : '';

  let mermaid = `\`\`\`mermaid\ngantt${title}\n  dateFormat YYYY-MM-DD\n`;

  tasks.forEach((task) => {
    const statusStr = task.status ? `, ${task.status}` : '';
    const deps = task.dependencies?.length ? `, ${task.dependencies.join(',')}` : '';
    const duration = task.duration ? `, ${task.duration}d` : '';
    mermaid += `  ${task.id} :${statusStr}${deps}${duration}, ${task.start}\n`;
  });

  mermaid += '\`\`\`';

  return {
    markdown: mermaid,
    description: 'Gantt chart for project scheduling and timeline visualization',
    type: 'gantt',
  };
}

/**
 * State diagram - for state machines, workflows with states
 */
export function createStateDiagram(
  states: string[],
  transitions: Array<{
    from: string;
    to: string;
    event: string;
  }>,
  options?: { initialState?: string; finalState?: string; title?: string }
): MermaidChart {
  const title = options?.title ? `title ${options.title}\n` : '';

  let mermaid = `\`\`\`mermaid\nstateDiagram-v2\n${title}`;

  // Mark initial/final states
  if (options?.initialState) {
    mermaid += `  [*] --> ${options.initialState}\n`;
  }

  // Add transitions
  transitions.forEach((t) => {
    mermaid += `  ${t.from} --> ${t.to} : ${t.event}\n`;
  });

  if (options?.finalState) {
    mermaid += `  ${options.finalState} --> [*]\n`;
  }

  mermaid += '\`\`\`';

  return {
    markdown: mermaid,
    description: 'State diagram showing state transitions and workflows',
    type: 'state',
  };
}

/**
 * Class diagram - for OOP design, data structures, relationships
 */
export function createClassDiagram(
  classes: Array<{
    name: string;
    attributes?: Array<{ name: string; type: string }>;
    methods?: Array<{ name: string; returnType?: string }>;
  }>,
  relationships?: Array<{
    from: string;
    to: string;
    type?: 'inheritance' | 'composition' | 'aggregation' | 'association';
  }>,
  options?: { title?: string }
): MermaidChart {
  const title = options?.title ? `\ntitle ${options.title}` : '';

  let mermaid = `\`\`\`mermaid\nclassDiagram${title}\n`;

  // Add classes
  classes.forEach((cls) => {
    mermaid += `  class ${cls.name} {\n`;

    // Add attributes
    cls.attributes?.forEach((attr) => {
      mermaid += `    ${attr.type} ${attr.name}\n`;
    });

    // Add methods
    cls.methods?.forEach((method) => {
      const returnType = method.returnType ? method.returnType + ' ' : '';
      mermaid += `    ${returnType}${method.name}()\n`;
    });

    mermaid += '  }\n';
  });

  // Add relationships
  relationships?.forEach((rel) => {
    const typeMap: Record<string, string> = {
      inheritance: '<|--',
      composition: '*--',
      aggregation: 'o--',
      association: '--',
    };
    const arrow = typeMap[rel.type || 'association'];
    mermaid += `  ${rel.from} ${arrow} ${rel.to}\n`;
  });

  mermaid += '\`\`\`';

  return {
    markdown: mermaid,
    description: 'Class diagram showing object-oriented design and relationships',
    type: 'class',
  };
}

/**
 * Convenience: Create a simple flowchart from just step names
 */
export function quickFlowchart(
  steps: string[],
  options?: { title?: string }
): MermaidChart {
  const stepObjects = steps.map((s, i) => ({
    id: `step${i}`,
    label: s,
  }));

  const connections = steps.slice(0, -1).map((_, i) => ({
    from: `step${i}`,
    to: `step${i + 1}`,
  }));

  return createFlowchart(stepObjects, connections, options);
}

/**
 * Convenience: Create a simple pie chart from key-value data
 */
export function quickPieChart(
  data: Record<string, number>,
  options?: { title?: string }
): MermaidChart {
  const items = Object.entries(data).map(([label, value]) => ({
    label,
    value,
  }));
  return createPieChart(items, options);
}
