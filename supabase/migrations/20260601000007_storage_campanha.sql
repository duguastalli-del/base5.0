-- =============================================================================
-- MIGRATION 007 — Storage: bucket campaign-media
-- =============================================================================
-- Bucket público para mídias de templates de mensagem (imagens e vídeos).
-- Usado por Templates.tsx e WhatsAppTemplates.tsx via:
--   supabase.storage.from("campaign-media").upload(path, file)
--   supabase.storage.from("campaign-media").remove([path])
-- A URL pública é salva em message_templates.media_url e
-- whatsapp_templates.cabecalho_conteudo.
--
-- Limites inferidos do código:
--   LIMITE_IMAGEM = 5 MB  (Templates.tsx linha ~6)
--   LIMITE_VIDEO  = 16 MB (Templates.tsx linha ~7)
--
-- TODO: confirmar no Supabase Dashboard → Storage → campaign-media:
--   - Se o bucket é público ou privado com URL assinada
--   - Mime types permitidos (image/*, video/mp4, etc.)
--   - Tamanho máximo configurado no Dashboard
-- =============================================================================

-- NOTA: A criação do bucket em si é feita no Supabase Dashboard ou via API.
-- As políticas de Storage abaixo assumem que o bucket "campaign-media" já existe.
-- Para criar via SQL (Supabase Storage v2):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('campaign-media', 'campaign-media', true)
-- ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- POLÍTICAS DE STORAGE
-- Prefixo dos objetos: {workspace_id}/{tipo}/{uuid}.{ext}
-- Exemplos:
--   abc123/templates/f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg
--   abc123/wa-templates/9e107d9d-372b-4a2c-a4e6-c2f0d9e7b5a1.mp4
-- TODO: confirmar prefixo real no Dashboard.
-- -----------------------------------------------------------------------------

-- Leitura pública (URLs diretas nos templates são abertas sem autenticação)
-- TODO: confirmar se o bucket é público; se for, esta policy pode não ser necessária.
CREATE POLICY "campaign_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-media');

-- Upload: apenas admin/coordenador do workspace podem fazer upload
-- O path deve começar com o workspace_id do usuário
CREATE POLICY "campaign_media_upload_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campaign-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = meu_workspace()::text
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- Update: mesma regra do upload
-- TODO: confirmar se update é usado (o app parece remover e reenviar em vez de update)
CREATE POLICY "campaign_media_update_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = meu_workspace()::text
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- Delete: admin/coordenador podem remover mídias do próprio workspace
CREATE POLICY "campaign_media_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = meu_workspace()::text
    AND meu_papel() IN ('administrador', 'coordenador')
  );
