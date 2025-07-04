"use client";

import { useState } from "react";
import DropZone from "../components/drop-zone";
import { Button } from "@/components/ui/button";

export default function BgRemoverPage() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [status, setStatus] = useState<string>("");

  const handleRemoveBg = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select an image file.");
      return;
    }
    const formData = new FormData();
    formData.append("file", files[0]);
    setStatus("Uploading and queuing image...");
    const response = await fetch("api/remove-background/", {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      setStatus("Image queued for background removal!");
    } else {
      setStatus("Error: " + (await response.text()));
    }
  };

  return (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <h1 className="text-2xl font-bold p-8">Background Remover</h1>
      <DropZone onFilesChange={setFiles} />
      <Button className="mt-6" onClick={handleRemoveBg}>
        Remove Background
      </Button>
      {status && <div className="mt-4 text-center">{status}</div>}
    </div>
  );
}
