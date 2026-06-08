'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImagePreviewProps {
  urls: string[];
  onDownloadAll?: () => void;
}

export function ImagePreview({ urls, onDownloadAll }: ImagePreviewProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  function downloadImage(url: string, index: number) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-image-${index + 1}.png`;
    a.click();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {urls.map((url, i) => (
          <div key={url} className="relative group rounded-md overflow-hidden border bg-gray-100 aspect-square">
            <Image
              src={url}
              alt={`Generated image ${i + 1}`}
              fill
              className="object-cover cursor-pointer"
              onClick={() => setLightbox(url)}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 p-2">
              <Button size="sm" variant="secondary" onClick={() => setLightbox(url)}>
                View
              </Button>
              <Button size="sm" variant="secondary" onClick={() => downloadImage(url, i)}>
                Download
              </Button>
            </div>
          </div>
        ))}
      </div>
      {urls.length > 1 && onDownloadAll && (
        <Button variant="outline" size="sm" onClick={onDownloadAll} className="mt-2">
          Download all
        </Button>
      )}

      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && (
            <div className="relative aspect-square w-full">
              <Image src={lightbox} alt="Full size" fill className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
