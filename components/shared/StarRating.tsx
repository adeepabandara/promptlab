'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value?: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value = 0, onChange, readOnly }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          className={cn(
            'text-xl transition-colors',
            readOnly ? 'cursor-default' : 'cursor-pointer',
            (hovered || value) >= star ? 'text-amber-400' : 'text-gray-300'
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}
