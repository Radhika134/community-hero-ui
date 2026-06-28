"use client";

import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Issue {
  id?: string;
  issue_type: string;
  severity: number;
  confidence: number;
  action_required: string;
  lat: number;
  lng: number;
  location?: string;
  address?: string;
  createdAt: string;
}

interface IssueMapProps {
  issues: Issue[];
}

// Generate animated custom markers based on severity score
const createDivIcon = (severity: number) => {
  if (typeof window === "undefined") return undefined;

  let colorClass = "";
  let glowClass = "";
  if (severity >= 8) {
    colorClass = "bg-red-500";
    glowClass = "shadow-[0_0_10px_rgba(239,68,68,0.8)]";
  } else if (severity >= 4) {
    colorClass = "bg-amber-500";
    glowClass = "shadow-[0_0_10px_rgba(245,158,11,0.8)]";
  } else {
    colorClass = "bg-emerald-500";
    glowClass = "shadow-[0_0_10px_rgba(16,185,129,0.8)]";
  }

  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `<div class="relative flex items-center justify-center h-5 w-5">
             <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-30"></span>
             <span class="relative inline-flex rounded-full h-3 w-3 ${colorClass} ${glowClass} border border-slate-950"></span>
           </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

export default function IssueMap({ issues = [] }: IssueMapProps) {
  const center: [number, number] = [28.6139, 77.2090];
  const zoom = 13;

  return (
    <div style={{ height: "100%", width: "100%", borderRadius: "12px", overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {issues.map((issue, idx) => {
          if (!issue.lat || !issue.lng) return null;

          const icon = createDivIcon(issue.severity);

          return (
            <Marker
              key={issue.id || idx}
              position={[issue.lat, issue.lng]}
              icon={icon}
            >
              <Popup>
                <div className="text-slate-900 font-sans text-xs space-y-1">
                  <div className="flex justify-between items-center gap-4">
                    <span className="font-bold uppercase tracking-wider text-[9px] text-slate-500">
                      Issue ID: {issue.id ? issue.id.substring(0, 8) : "local"}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 text-[8px] font-bold rounded ${
                        issue.severity >= 8
                          ? "bg-red-100 text-red-700"
                          : issue.severity >= 4
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      LVL {issue.severity}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm capitalize">
                    {issue.issue_type}
                  </h4>
                  <p className="text-[10px] text-slate-700 font-medium">
                    📍 {issue.address || "New Delhi"}
                  </p>
                  <p className="text-[9px] text-slate-500 font-mono">
                    COORD: {issue.lat.toFixed(4)}, {issue.lng.toFixed(4)}
                  </p>
                  <p className="text-slate-600 text-[10px] italic border-t border-slate-100 pt-1.5 mt-1.5 leading-normal">
                    {issue.action_required}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
