import React from "react";

export default function PerformancePage() {
  return (
    <div className="h-full w-full">
      <iframe
        src="https://strike-smart-sales.lovable.app/"
        className="w-full h-[calc(100vh-4rem)] border-0"
        title="STRIKE - Smart Sales"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
