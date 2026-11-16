import * as React from 'react';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@voice-agent/ui';
import { KNOWLEDGE_UPLOAD_ACCEPT } from '../../lib/knowledge/knowledge-extraction-client';
import { KnowledgeUploadPreview } from './knowledge-upload-preview';
import {
  useKnowledgeUpload,
  type UploadConfirm,
  type KnowledgeUploadState,
} from './use-knowledge-upload';

interface Props {
  readonly orgSlug: string;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: UploadConfirm;
}

function UploadError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      data-testid="kb-upload-error"
      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
    >
      {message}
    </p>
  );
}

function FilePicker({ upload }: { readonly upload: KnowledgeUploadState }) {
  const reading = upload.phase === 'reading';
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs font-medium" htmlFor="kb-upload-file">
        <span>Arquivo (.txt, .md ou .docx)</span>
        <input
          id="kb-upload-file"
          type="file"
          accept={KNOWLEDGE_UPLOAD_ACCEPT}
          disabled={reading}
          className="block w-full text-xs min-h-[44px]"
          onChange={(e) => upload.selectFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Limites: 2 MB para TXT/Markdown e 10 MB para DOCX. PDF ainda não é aceito.
      </p>
      <Button
        size="sm"
        className="min-h-[44px] text-xs gap-2"
        disabled={!upload.file || reading || upload.error !== null}
        onClick={() => void upload.read()}
      >
        {reading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {reading ? 'Lendo arquivo…' : 'Ler arquivo'}
      </Button>
    </div>
  );
}

function ConfirmBar({
  upload,
  onCancel,
}: {
  readonly upload: KnowledgeUploadState;
  readonly onCancel: () => void;
}) {
  const confirming = upload.phase === 'confirming';
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className="min-h-[44px] text-xs"
        disabled={confirming}
        onClick={onCancel}
      >
        Cancelar
      </Button>
      <Button
        size="sm"
        className="min-h-[44px] text-xs gap-2"
        disabled={confirming || !upload.title.trim()}
        onClick={() => void upload.confirm()}
        data-testid="kb-upload-confirm"
      >
        {confirming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {confirming ? 'Cadastrando…' : 'Confirmar e cadastrar'}
      </Button>
    </div>
  );
}

function UploadDone({
  duplicate,
  onClose,
}: {
  readonly duplicate: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="kb-upload-success"
      className="py-10 flex flex-col items-center gap-3 text-center"
    >
      <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
      <p className="text-sm font-semibold">
        {duplicate ? 'Documento já cadastrado' : 'Documento cadastrado'}
      </p>
      <Button size="sm" className="min-h-[44px] text-xs" onClick={onClose}>
        Concluir
      </Button>
    </div>
  );
}

/** Envio de arquivo (DEC-065): escolher → ler (sem gravar) → revisar → confirmar. */
export function KnowledgeUploadDialog({ orgSlug, isOpen, onOpenChange, onConfirm }: Props) {
  const upload = useKnowledgeUpload(orgSlug, onConfirm);
  const busy = upload.phase === 'reading' || upload.phase === 'confirming';
  const close = () => {
    upload.reset();
    onOpenChange(false);
  };
  return (
    <Sheet open={isOpen} onOpenChange={(o) => !busy && (o ? onOpenChange(true) : close())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        data-testid="kb-upload-sheet"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4" aria-hidden="true" /> Enviar arquivo
          </SheetTitle>
          <SheetDescription>
            O texto é lido no servidor e mostrado para revisão. Nada é salvo até você confirmar.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4" aria-busy={busy}>
          {upload.phase === 'done' ? (
            <UploadDone duplicate={upload.duplicate} onClose={close} />
          ) : (
            <>
              <UploadError message={upload.error} />
              {upload.preview ? (
                <>
                  <KnowledgeUploadPreview upload={upload} />
                  <ConfirmBar upload={upload} onCancel={close} />
                </>
              ) : (
                <FilePicker upload={upload} />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
