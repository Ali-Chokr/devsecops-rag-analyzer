import { Component, input } from '@angular/core';
import {
  buildContextLines,
  chunkSourceLabel,
  ContextLine,
} from '../../core/utils/context-highlight.util';
import { RagChunk } from '../../core/services/chat.service';

@Component({
  selector: 'app-context-panel',
  imports: [],
  templateUrl: './context-panel.component.html',
  styleUrl: './context-panel.component.scss',
})
export class ContextPanelComponent {
  chunks = input<RagChunk[]>([]);
  query = input('');

  linesFor(chunk: RagChunk): ContextLine[] {
    return buildContextLines(chunk.content, this.query());
  }

  sourceLabel(chunk: RagChunk): string {
    return chunkSourceLabel(chunk.metadata ?? {}, chunk.source_type);
  }

  formatScore(score?: number): string {
    if (score === undefined || score === null) {
      return '—';
    }
    return score.toFixed(3);
  }
}
