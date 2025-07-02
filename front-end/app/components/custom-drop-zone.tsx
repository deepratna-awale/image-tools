import { UploadCloud } from "lucide-react";
import type { DropzoneState } from "shadcn-dropzone";
import Dropzone from "shadcn-dropzone";

export default function CustomDropZone() {
  return (
    <Dropzone
      dropZoneClassName="flex flex-col items-center justify-center h-full w-full gap-4 p-4 border-3 border-dashed border-zinc-900 rounded-lg bg-muted/20"
      onDrop={(acceptedFiles: File[]) => {
        // Do something with the files
        console.log(acceptedFiles);
      }}
    >
      {(dropzone: DropzoneState) => (
        <>
          {dropzone.isDragAccept ? (
            <div className="text-lg font-medium">Drop your files here!</div>
          ) : (
            <div className="flex items-center flex-col gap-2">
              <div className="flex items-center flex-row gap-2 mt-8 text-lg font-medium">
                <UploadCloud className="w-6 h-6" />
                Upload files
              </div>
            </div>
          )}
          <div className="text-sm font-medium">
            {dropzone.acceptedFiles.length} files uploaded so far.
          </div>
        </>
      )}
    </Dropzone>
  );
}
