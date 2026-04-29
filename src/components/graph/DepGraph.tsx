import { useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, Node, Edge, Position } from "@xyflow/react";
import dagre from "dagre";
import type { Item } from "@/types";
import { STATUS_CONFIG, parseDependsOn } from "@/lib/utils";
import "@xyflow/react/dist/style.css";

interface DepGraphProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    backlog: "#64748b",
    todo: "#38bdf8",
    in_progress: "#fbbf24",
    done: "#10b981",
    canceled: "#ef4444",
    duplicate: "#8b5cf6",
  };
  return map[status] || "#64748b";
}

function layoutElements(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const connectedIds = new Set<string>();
  edges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const connected = nodes.filter((n) => connectedIds.has(n.id));
  const disconnected = nodes.filter((n) => !connectedIds.has(n.id));

  const layoutedNodes: Node[] = [];

  if (connected.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });

    connected.forEach((node) => {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });
    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    connected.forEach((node) => {
      const pos = g.node(node.id);
      layoutedNodes.push({
        ...node,
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
      });
    });
  }

  const graphBottom = layoutedNodes.length > 0
    ? Math.max(...layoutedNodes.map((n) => n.position.y)) + NODE_HEIGHT + 80
    : 0;

  const cols = Math.ceil(Math.sqrt(disconnected.length));
  disconnected.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layoutedNodes.push({
      ...node,
      position: { x: col * (NODE_WIDTH + 30), y: graphBottom + row * (NODE_HEIGHT + 20) },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    });
  });

  return { nodes: layoutedNodes, edges };
}

export function DepGraph({ items, onItemClick }: DepGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const extIdToNodeId = new Map<string, string>();
    items.forEach((item) => {
      const key = `${item.scope}::${item.external_id}`;
      extIdToNodeId.set(key, item.id);
      extIdToNodeId.set(item.external_id, item.id);
    });

    const nodeList: Node[] = items.map((item) => ({
      id: item.id,
      data: { label: `${item.external_id} — ${item.title}`, item },
      style: {
        background: "hsl(240 17% 12%)",
        border: `2px solid ${getStatusColor(item.status)}`,
        color: "#e2e8f0",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "11px",
        width: NODE_WIDTH,
      },
      position: { x: 0, y: 0 },
    }));

    const edgeList: Edge[] = [];
    items.forEach((item) => {
      const deps = parseDependsOn(item.depends_on);
      deps.forEach((dep) => {
        const scopedKey = `${item.scope}::${dep}`;
        const sourceNodeId = extIdToNodeId.get(scopedKey) || extIdToNodeId.get(dep);
        if (sourceNodeId && sourceNodeId !== item.id) {
          edgeList.push({
            id: `${sourceNodeId}->${item.id}`,
            source: sourceNodeId,
            target: item.id,
            style: { stroke: "#475569" },
            animated: item.status === "in_progress",
          });
        }
      });
    });

    return layoutElements(nodeList, edgeList);
  }, [items]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const item = (node.data as { item: Item }).item;
      if (item) onItemClick(item);
    },
    [onItemClick]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
