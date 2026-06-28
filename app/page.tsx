"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";

const IssueMap = dynamic(() => import("@/components/IssueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center font-mono text-cyan-500/50 bg-slate-950">
      MAP UPLINK INITIATING...
    </div>
  ),
});

interface AnalysisResult {
  issue_type: string;
  severity: number;
  confidence: number;
  action_required: string;
}

export default function Home() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [location, setLocation] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [issues, setIssues] = useState<any[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Firestore issues on component mount
  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "issues"));
        const list = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setIssues(list);
      } catch (err) {
        console.error("Error loading issues from database:", err);
      }
    };
    fetchIssues();
  }, []);

  // File processing to convert to base64
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("CRITICAL: Invalid file type. Images only.");
      return;
    }
    setError(null);
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      // Extract the raw base64 data portion
      const base64 = dataUrl.split(",")[1];
      setBase64Image(base64);
    };
    reader.onerror = () => {
      setError("CRITICAL: Failed to parse uploaded image.");
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreview(null);
    setBase64Image(null);
    setMimeType(null);
    setAnalysisResult(null);
    setError(null);
  };

  // API Call to /api/analyze
  const handleReportSubmit = async () => {
    if (!base64Image || !mimeType) {
      setError("CRITICAL: No scan payload detected. Upload image first.");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult(null);

    // Geolocation helper using Promise wrapper
    const getCoordinates = (): Promise<{ lat: number; lng: number }> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !navigator.geolocation) {
          console.warn("Geolocation API not supported by browser. Falling back to New Delhi.");
          resolve({ lat: 28.6139, lng: 77.2090 });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (err) => {
            console.warn("Geolocation failed or denied, using New Delhi fallback:", err);
            resolve({ lat: 28.6139, lng: 77.2090 });
          }
        );
      });
    };

    try {
      // 1. Get browser geolocation coordinates
      const coords = await getCoordinates();

      // 2. Fetch analysis from API
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ base64Image, mimeType }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || "AI uplink response failed.";
        throw new Error(errorMsg);
      }

      // Check if backend returned an error
      if (data.error) {
        throw new Error(data.error);
      }

      // Update state to render results using the cleaned backend data
      setAnalysisResult(data);

      // Save report to Firestore issues collection using real coordinates and typed address
      const newIssueDoc = {
        issue_type: data.issue_type,
        severity: Number(data.severity),
        confidence: Number(data.confidence),
        action_required: data.action_required,
        lat: coords.lat,
        lng: coords.lng,
        address: location || "New Delhi",
        createdAt: new Date().toISOString()
      };

      try {
        const docRef = await addDoc(collection(db, "issues"), newIssueDoc);
        setIssues((prev) => [...prev, { id: docRef.id, ...newIssueDoc }]);
      } catch (dbErr) {
        console.error("Failed to persist issue to Firestore:", dbErr);
      }
    } catch (error: any) {
      console.error("Submission failed:", error);
      setError(error?.message || "An unexpected error occurred during AI analysis.");
    } finally {
      // Unconditionally stop loading spinner
      setLoading(false);
    }
  };

  // Helper for severity color codes
  const getSeverityStyle = (severity: number) => {
    if (severity >= 8) {
      return {
        text: "text-red-500 glow-text-red",
        border: "border-red-500/30 bg-red-950/20",
        label: "CRITICAL",
      };
    } else if (severity >= 4) {
      return {
        text: "text-amber-500 glow-text-amber",
        border: "border-amber-500/30 bg-amber-950/20",
        label: "WARNING",
      };
    } else {
      return {
        text: "text-emerald-500 glow-text-emerald",
        border: "border-emerald-500/30 bg-emerald-950/20",
        label: "STABLE",
      };
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar - Left (Fixed Width) */}
      <section className="w-full md:w-96 h-screen flex flex-col justify-between bg-slate-900/40 backdrop-blur-xl border-b md:border-b-0 md:border-r border-white/10 p-6 flex-shrink-0 relative overflow-y-auto z-20">
        <div className="absolute top-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Section */}
        <div className="space-y-6">
          <div className="border-b border-white/5 pb-4">
            <h1 className="text-2xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 glow-text-cyan flex items-center gap-2">
              Community Hero <span className="text-xl">🦸‍♂️</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${loading ? "bg-amber-400" : "bg-cyan-400"}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${loading ? "bg-amber-500" : "bg-cyan-500"}`}></span>
              </span>
              <span className="text-[10px] font-mono tracking-widest text-cyan-500/70">
                {loading ? "PROCESSING UPLINK DATAStream" : "UPLINK ACTIVE // SYS_CONSOLE_03"}
              </span>
            </div>
          </div>

          {/* Form & Actions Section */}
          <div className="space-y-6">
            {/* Drag & Drop Upload Area */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-cyan-500/75 tracking-wider uppercase block">
                01 // Capture Civic Threat
              </label>
              
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group relative overflow-hidden h-48 ${
                  isDragActive
                    ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    : "border-cyan-500/30 hover:border-cyan-400/80 bg-slate-950/50 hover:bg-slate-900/30"
                }`}
              >
                {imagePreview ? (
                  <div className="absolute inset-0 w-full h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="Civic threat scan preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-950/50 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <span className="text-[10px] font-mono bg-cyan-500 text-slate-950 px-2 py-1 rounded font-bold uppercase tracking-wider">
                        Change Image
                      </span>
                      <button
                        onClick={clearImage}
                        className="text-[9px] font-mono bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded uppercase tracking-wider"
                      >
                        Reset Payload
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent -translate-y-full group-hover:animate-[sweep_2s_ease-in-out_infinite] pointer-events-none"></div>
                    <svg
                      className="w-10 h-10 text-cyan-500/60 group-hover:text-cyan-400 transition-colors mb-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="text-xs font-mono text-slate-300 font-semibold tracking-wide uppercase group-hover:text-cyan-300 transition-colors">
                      Upload Scan Data
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 mt-1">
                      Drag & drop file or tap camera
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Address Input Area */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-cyan-500/75 tracking-wider uppercase block">
                02 // Target Coordinates
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-4 w-4 text-cyan-500/50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter location / address..."
                  className="w-full bg-slate-950/70 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono tracking-wide"
                />
                <span className="absolute right-3 top-3 text-[8px] font-mono text-cyan-500/30 select-none">
                  LOC_COORD
                </span>
              </div>
            </div>

            {/* Error Message Display */}
            {error && (
              <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-[10px] font-mono text-red-400 space-y-1">
                <span className="font-bold block">UPLINK ERROR:</span>
                <span className="block leading-relaxed">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Trigger Button Section */}
        <div className="mt-8 md:mt-0 border-t border-white/5 pt-6 space-y-4">
          <button
            onClick={handleReportSubmit}
            disabled={loading || !base64Image}
            className={`w-full py-4 font-bold tracking-widest text-xs rounded-lg uppercase font-mono transition-all duration-300 flex items-center justify-center gap-2 ${
              loading
                ? "bg-amber-500 text-slate-950 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse cursor-wait"
                : !base64Image
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                : "bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 glow-btn-cyan hover:glow-btn-cyan-hover cursor-pointer"
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing Civic Threat...
              </>
            ) : (
              "⚡ Snap & Report"
            )}
          </button>

          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 px-1">
            <span>VER: 4.81.0-NEXT</span>
            <span>SECURE TRANSMISSION</span>
          </div>
        </div>
      </section>

      {/* Main Content Area - Right */}
      <section className="flex-1 flex flex-col p-6 gap-6 h-screen overflow-y-auto">
        {/* Top Status Bar */}
        <header className="h-16 flex-shrink-0 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-xl px-6 flex items-center justify-between relative overflow-hidden z-10">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>

          <div className="flex items-center gap-6 divide-x divide-white/10">
            <div className="flex items-center gap-2.5">
              <div className="p-1 bg-cyan-500/10 rounded border border-cyan-500/20 text-cyan-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="text-xs font-mono">
                <div className="text-slate-400 uppercase text-[9px]">Hero Level</div>
                <div className="text-slate-100 flex items-center gap-2">
                  <span>3</span>
                  <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden inline-block">
                    <div className="bg-cyan-500 h-full rounded-full" style={{ width: "60%" }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pl-6">
              <div className="p-1 bg-teal-500/10 rounded border border-teal-500/20 text-teal-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-xs font-mono">
                <div className="text-slate-400 uppercase text-[9px]">Resolved</div>
                <div className="text-slate-100 font-bold">{analysisResult ? "25 Reports" : "24 Reports"}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pl-6">
              <div className="p-1 bg-indigo-500/10 rounded border border-indigo-500/20 text-indigo-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="text-xs font-mono">
                <div className="text-slate-400 uppercase text-[9px]">Reputation</div>
                <div className="text-emerald-400 font-bold glow-text-emerald">
                  {analysisResult ? "+2,580 XP" : "+2,480 XP"}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/40 border border-cyan-800/30 px-2 py-0.5 rounded">
              GPS STATUS: LOCK
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
        </header>

        {/* Map Container */}
        <div className="flex-[6] min-h-[300px] bg-slate-950 border border-cyan-900/30 rounded-xl relative overflow-hidden glow-border-cyan z-0">
          <IssueMap issues={issues} />
        </div>

        {/* AI Analysis Cards (Bottom Grid of 4) */}
        <div className="flex-[4] min-h-[180px] grid grid-cols-2 lg:grid-cols-4 gap-6 z-0">
          {/* Card 1: Issue Type */}
          <div className={`backdrop-blur-md border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 ${
            loading 
              ? "bg-slate-900/10 border-cyan-500/25 animate-pulse" 
              : analysisResult 
              ? "bg-slate-900/40 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.05)]" 
              : "bg-slate-900/30 border-white/5 hover:border-cyan-500/20"
          }`}>
            <div className="absolute top-0 right-0 bg-slate-900/80 border-b border-l border-white/10 px-2 py-0.5 text-[8px] font-mono text-slate-500 select-none">
              SYS_AI_01
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-cyan-500/70 tracking-widest uppercase block">
                01 // Issue Type
              </span>
              <h3 className={`font-mono font-bold tracking-wide uppercase transition-all duration-300 ${
                loading 
                  ? "text-cyan-500/40 text-xs" 
                  : analysisResult 
                  ? "text-cyan-400 text-sm glow-text-cyan" 
                  : "text-slate-400 text-xs"
              }`}>
                {loading ? "[AI CATEGORIZING...]" : analysisResult ? analysisResult.issue_type : "[AWAITING DATA]"}
              </h3>
            </div>
            <div className="text-[9px] font-mono text-slate-600 mt-4 flex justify-between items-center">
              <span>CLASS: {analysisResult ? "IDENTIFIED" : "UNRESOLVED"}</span>
              <span className={loading ? "text-cyan-400 animate-pulse" : analysisResult ? "text-cyan-400" : ""}>
                ● {loading ? "SCANNING" : analysisResult ? "ACTIVE" : "STANDBY"}
              </span>
            </div>
          </div>

          {/* Card 2: Severity */}
          {(() => {
            const severityStyle = analysisResult ? getSeverityStyle(analysisResult.severity) : null;
            return (
              <div className={`backdrop-blur-md border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 ${
                loading 
                  ? "bg-slate-900/10 border-amber-500/25 animate-pulse" 
                  : analysisResult 
                  ? `${severityStyle?.border} shadow-[0_0_15px_rgba(6,182,212,0.02)]`
                  : "bg-slate-900/30 border-white/5 hover:border-cyan-500/20"
              }`}>
                <div className="absolute top-0 right-0 bg-slate-900/80 border-b border-l border-white/10 px-2 py-0.5 text-[8px] font-mono text-slate-500 select-none">
                  SYS_AI_02
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-cyan-500/70 tracking-widest uppercase block">
                    02 // Severity
                  </span>
                  <h3 className={`font-mono font-bold tracking-wide transition-all duration-300 ${
                    loading 
                      ? "text-amber-500/40 text-xs" 
                      : analysisResult 
                      ? `${severityStyle?.text} text-2xl` 
                      : "text-slate-400 text-xs"
                  }`}>
                    {loading ? "[CALCULATING...]" : analysisResult ? `${analysisResult.severity}/10` : "[WAITING...]"}
                  </h3>
                </div>
                <div className="text-[9px] font-mono text-slate-600 mt-4 flex justify-between items-center">
                  <span>THREAT: {analysisResult ? severityStyle?.label : "TBD"}</span>
                  <span className={analysisResult ? severityStyle?.text : "text-cyan-500/40"}>
                    EST_LVL: {analysisResult ? analysisResult.severity : 0}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Card 3: Confidence */}
          <div className={`backdrop-blur-md border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 ${
            loading 
              ? "bg-slate-900/10 border-cyan-500/25 animate-pulse" 
              : analysisResult 
              ? "bg-slate-900/40 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.05)]" 
              : "bg-slate-900/30 border-white/5 hover:border-cyan-500/20"
          }`}>
            <div className="absolute top-0 right-0 bg-slate-900/80 border-b border-l border-white/10 px-2 py-0.5 text-[8px] font-mono text-slate-500 select-none">
              SYS_AI_03
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-cyan-500/70 tracking-widest uppercase block">
                03 // Confidence
              </span>
              <h3 className={`font-mono font-bold tracking-wide transition-all duration-300 ${
                loading 
                  ? "text-cyan-500/40 text-xs" 
                  : analysisResult 
                  ? "text-cyan-400 text-xl glow-text-cyan" 
                  : "text-slate-400 text-xs"
              }`}>
                {loading ? "[COMPUTING...]" : analysisResult ? `${(analysisResult.confidence * 100).toFixed(1)}%` : "0.0%"}
              </h3>
            </div>
            <div className="text-[9px] font-mono text-slate-600 mt-4 flex justify-between items-center">
              <span>MODEL: v1.5_FLASH</span>
              <span className="text-cyan-500/30">MIN_THRES: 80%</span>
            </div>
          </div>

          {/* Card 4: Action Required */}
          <div className={`backdrop-blur-md border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between group transition-all duration-300 ${
            loading 
              ? "bg-slate-900/10 border-cyan-500/25 animate-pulse" 
              : analysisResult 
              ? "bg-slate-900/40 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.05)]" 
              : "bg-slate-900/30 border-white/5 hover:border-cyan-500/20"
          }`}>
            <div className="absolute top-0 right-0 bg-slate-900/80 border-b border-l border-white/10 px-2 py-0.5 text-[8px] font-mono text-slate-500 select-none">
              SYS_AI_04
            </div>
            <div className="space-y-1 overflow-hidden h-full flex flex-col justify-start">
              <span className="text-[10px] font-mono text-cyan-500/70 tracking-widest uppercase block mb-1">
                04 // Action Required
              </span>
              <p className={`font-mono transition-all duration-300 leading-normal overflow-y-auto text-[10px] pr-1 ${
                loading 
                  ? "text-cyan-500/40 italic" 
                  : analysisResult 
                  ? "text-slate-300" 
                  : "text-slate-500"
              }`}>
                {loading ? "[ROUTING DISPATCH DIALOGUE...]" : analysisResult ? analysisResult.action_required : "AWAITING TELEMETRY UPLINK"}
              </p>
            </div>
            <div className="text-[9px] font-mono text-slate-600 mt-2 flex justify-between items-center flex-shrink-0">
              <span>DISPATCH: {analysisResult ? "READY" : "DEFERRED"}</span>
              <span className={analysisResult ? "text-emerald-400 glow-text-emerald" : "text-cyan-500/40"}>
                {analysisResult ? "ONLINE" : "READY"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
