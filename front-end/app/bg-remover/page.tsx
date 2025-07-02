"use client"

import CustomDropZone from "../components/custom-drop-zone";


export default function BgRemoverPage() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Background Remover</h1>
      <CustomDropZone />
    </div>
  );
}
