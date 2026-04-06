"use client";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type GNode = {
  id: string;
  label: string;
  domain: string;
  orphan: boolean;
  hubScore: number;
};

type GEdge = { source: string; target: string };

export default function BrainGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/graph");
    if (!r.ok) return;
    const g = (await r.json()) as { nodes: GNode[]; edges: GEdge[] };
    const byDomain = new Map<string, number>();
    let domIdx = 0;
    const posCounts = new Map<string, number>();
    const flowNodes: Node[] = (g.nodes ?? []).map((n) => {
      if (!byDomain.has(n.domain)) byDomain.set(n.domain, domIdx++);
      const xBase = (byDomain.get(n.domain) ?? 0) * 380;
      const yCount = posCounts.get(n.domain) ?? 0;
      posCounts.set(n.domain, yCount + 1);
      return {
        id: n.id,
        position: { x: xBase, y: yCount * 70 },
        data: { label: n.label },
        style: {
          background: n.orphan ? "#3f2e2e" : "#0f172a",
          color: "#e2e8f0",
          border: n.hubScore > 2 ? "1px solid #38bdf8" : "1px solid #334155",
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          width: 180,
        },
      };
    });
    const flowEdges: Edge[] = (g.edges ?? []).map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
    }));
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [setEdges, setNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-[720px] w-full rounded-xl border border-[var(--border)] bg-[var(--card)]/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}
