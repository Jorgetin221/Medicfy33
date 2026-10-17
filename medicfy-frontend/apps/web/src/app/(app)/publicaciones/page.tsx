"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  doctorPostCreateSchema,
  EDUCATIONAL_POST_CATEGORIES,
  POST_CATEGORIES,
  type DoctorPostCreateInput,
  type PostCategory,
} from "@medicfy/contracts";
import { apiFetch, apiFetchBlob, apiUpload, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDoctorProfile } from "@/lib/use-doctor-profile";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, Textarea, SelectInput } from "@/components/ui/field";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { FileFormatNotice, useAcceptedFile } from "@/components/ui/accepted-file";

const POST_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";
import type { MessageKey } from "@/lib/i18n/dictionaries";

// Mismas categorías que el perfil público: una sola traducción para
// las dos pantallas.
const CATEGORY_LABEL_KEYS: Record<PostCategory, MessageKey> = {
  HEALTH_EDUCATION: "perfilPublico.categorias.HEALTH_EDUCATION",
  HEALTH_TIP: "perfilPublico.categorias.HEALTH_TIP",
  HEALTH_FACT: "perfilPublico.categorias.HEALTH_FACT",
  PROFESSIONAL_UPDATE: "perfilPublico.categorias.PROFESSIONAL_UPDATE",
  CONGRESS: "perfilPublico.categorias.CONGRESS",
  RESEARCH: "perfilPublico.categorias.RESEARCH",
  CERTIFICATION: "perfilPublico.categorias.CERTIFICATION",
  PATIENT_NOTICE: "perfilPublico.categorias.PATIENT_NOTICE",
  PREVENTION: "perfilPublico.categorias.PREVENTION",
  LIFESTYLE: "perfilPublico.categorias.LIFESTYLE",
  VIDEO: "perfilPublico.categorias.VIDEO",
  PHOTO: "perfilPublico.categorias.PHOTO",
  ANNOUNCEMENT: "perfilPublico.categorias.ANNOUNCEMENT",
};

type PostVisibility = "PUBLIC" | "PATIENTS_ONLY" | "PRIVATE";
type PostLifecycleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const VISIBILITY_META: Record<PostVisibility, { labelKey: MessageKey; icon: string }> = {
  PUBLIC: { labelKey: "publicaciones.visibilidad.PUBLIC", icon: "🌎" },
  PATIENTS_ONLY: { labelKey: "publicaciones.visibilidad.PATIENTS_ONLY", icon: "👥" },
  PRIVATE: { labelKey: "publicaciones.visibilidad.PRIVATE", icon: "🔒" },
};

const STATUS_LABEL_KEYS: Record<PostLifecycleStatus, MessageKey> = {
  DRAFT: "publicaciones.estado.DRAFT",
  PUBLISHED: "publicaciones.estado.PUBLISHED",
  ARCHIVED: "publicaciones.estado.ARCHIVED",
};

const EDUCATIONAL_SET = new Set<string>(EDUCATIONAL_POST_CATEGORIES);

interface PostMedia {
  id: string;
  mediaType: string;
  displayOrder: number;
}
interface DoctorPost {
  id: string;
  title: string | null;
  body: string;
  category: PostCategory;
  visibility: PostVisibility;
  status: PostLifecycleStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  media: PostMedia[];
}

// M2B (spec §7, v2.2): panel privado de publicaciones — mismo guard de
// auth que /perfil.
export default function PublicacionesPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <PublicacionesContent accessToken={accessToken} />;
}

function PublicacionesContent({ accessToken }: { accessToken: string }) {
  const t = useT();
  const { doctor } = useDoctorProfile(accessToken);
  const [posts, setPosts] = useState<DoctorPost[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editingPost, setEditingPost] = useState<DoctorPost | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiFetch<unknown>("/doctors/me/posts", { accessToken })
      .then((data) => setPosts(expectArray<DoctorPost>(data)))
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("publicaciones.titulo")}</h1>
          <p className="text-base text-gray-500">{t("publicaciones.subtitulo")}</p>
        </div>
        {doctor ? (
          <Link href={`/dr/${doctor.slug}`} className="mt-1 shrink-0 text-sm font-medium text-brand-700 underline">
            {t("publicaciones.verPublico")}
          </Link>
        ) : null}
      </div>

      <ComposerCard
        accessToken={accessToken}
        editingPost={editingPost}
        onDoneEditing={() => setEditingPost(null)}
        onSaved={load}
      />

      <div>
        <h2 className="font-heading text-xl text-brand-900">{t("publicaciones.misPublicaciones")}</h2>
        <div className="mt-4">
          {posts === null && !error ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={load} /> : null}
          {posts && posts.length === 0 ? (
            <EmptyState title={t("publicaciones.vacio")} description={t("publicaciones.vacioAyuda")} />
          ) : null}
          {posts && posts.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  accessToken={accessToken}
                  onEdit={() => setEditingPost(post)}
                  onChanged={load}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ComposerCard({
  accessToken,
  editingPost,
  onDoneEditing,
  onSaved,
}: {
  accessToken: string;
  editingPost: DoctorPost | null;
  onDoneEditing: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<DoctorPostCreateInput>({
    resolver: useZodResolver<DoctorPostCreateInput>(doctorPostCreateSchema),
    defaultValues: { title: "", body: "", category: "HEALTH_TIP", visibility: "PRIVATE" },
  });

  useEffect(() => {
    if (editingPost) {
      form.reset({
        title: editingPost.title ?? "",
        body: editingPost.body,
        category: editingPost.category,
        visibility: editingPost.visibility,
      });
    } else {
      form.reset({ title: "", body: "", category: "HEALTH_TIP", visibility: "PRIVATE" });
    }
    setSaved(false);
    setError(null);
  }, [editingPost, form]);

  const selectedCategory = form.watch("category");

  async function saveDraft(values: DoctorPostCreateInput) {
    setError(null);
    setSaved(false);
    try {
      if (editingPost) {
        await apiFetch(`/doctors/me/posts/${editingPost.id}`, { method: "PATCH", body: values, accessToken });
      } else {
        await apiFetch("/doctors/me/posts", { method: "POST", body: values, accessToken });
      }
      setSaved(true);
      onSaved();
      onDoneEditing();
      form.reset({ title: "", body: "", category: "HEALTH_TIP", visibility: "PRIVATE" });
    } catch (err) {
      setError(err);
    }
  }

  async function saveAndPublish(values: DoctorPostCreateInput) {
    setError(null);
    setSaved(false);
    try {
      let postId: string;
      if (editingPost) {
        const updated = await apiFetch<DoctorPost>(`/doctors/me/posts/${editingPost.id}`, {
          method: "PATCH",
          body: values,
          accessToken,
        });
        postId = updated.id;
      } else {
        const created = await apiFetch<DoctorPost>("/doctors/me/posts", { method: "POST", body: values, accessToken });
        postId = created.id;
      }
      await apiFetch(`/doctors/me/posts/${postId}`, { method: "PATCH", body: { status: "PUBLISHED" }, accessToken });
      setSaved(true);
      onSaved();
      onDoneEditing();
      form.reset({ title: "", body: "", category: "HEALTH_TIP", visibility: "PRIVATE" });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl text-brand-900">{editingPost ? t("publicaciones.editar") : t("publicaciones.crear")}</h2>
        {editingPost ? (
          <button type="button" onClick={onDoneEditing} className="text-sm font-medium text-gray-500 underline">
            {t("publicaciones.cancelarEdicion")}
          </button>
        ) : null}
      </div>
      <p className="text-sm text-gray-500">{t("publicaciones.queCompartir")}</p>

      <form className="mt-4 flex flex-col gap-4" noValidate>
        <FieldWrapper label={t("publicaciones.tituloCampo")} htmlFor="post-title" error={form.formState.errors.title?.message}>
          <TextInput id="post-title" error={!!form.formState.errors.title} {...form.register("title")} />
        </FieldWrapper>
        <FieldWrapper label={t("publicaciones.contenido")} htmlFor="post-body" error={form.formState.errors.body?.message}>
          <Textarea id="post-body" rows={5} error={!!form.formState.errors.body} {...form.register("body")} />
        </FieldWrapper>

        {EDUCATIONAL_SET.has(selectedCategory) ? (
          <Aviso variant="info" title={t("publicaciones.avisoAutomatico")}>
            {t("perfilPublico.disclaimerEducativo")}
          </Aviso>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("publicaciones.categoria")} htmlFor="post-category" error={form.formState.errors.category?.message}>
            <SelectInput id="post-category" {...form.register("category")}>
              {POST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_LABEL_KEYS[c])}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
          <FieldWrapper label={t("publicaciones.quienPuedeVer")} htmlFor="post-visibility" error={form.formState.errors.visibility?.message}>
            <SelectInput id="post-visibility" {...form.register("visibility")}>
              <option value="PRIVATE">{t("publicaciones.soloYo")}</option>
              <option value="PATIENTS_ONLY">{t("publicaciones.soloPacientes")}</option>
              <option value="PUBLIC">{t("publicaciones.publico")}</option>
            </SelectInput>
          </FieldWrapper>
        </div>

        {error ? <ErrorState error={error} /> : null}
        {saved && !error ? <Aviso variant="exito" title={t("publicaciones.guardado")} /> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" isLoading={form.formState.isSubmitting} onClick={form.handleSubmit(saveDraft)}>
            {t("publicaciones.guardarBorrador")}
          </Button>
          <Button type="button" isLoading={form.formState.isSubmitting} onClick={form.handleSubmit(saveAndPublish)}>
            {t("publicaciones.publicar")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PostCard({
  post,
  accessToken,
  onEdit,
  onChanged,
}: {
  post: DoctorPost;
  accessToken: string;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [actionError, setActionError] = useState<unknown>(null);
  const photoFormat = useAcceptedFile(POST_PHOTO_ACCEPT);
  const [isBusy, setIsBusy] = useState(false);
  const visibility = VISIBILITY_META[post.visibility];

  async function publish() {
    setActionError(null);
    setIsBusy(true);
    try {
      await apiFetch(`/doctors/me/posts/${post.id}`, { method: "PATCH", body: { status: "PUBLISHED" }, accessToken });
      onChanged();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function archive() {
    setActionError(null);
    setIsBusy(true);
    try {
      await apiFetch(`/doctors/me/posts/${post.id}`, { method: "PATCH", body: { status: "ARCHIVED" }, accessToken });
      onChanged();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("publicaciones.confirmarBorrar"))) return;
    setActionError(null);
    setIsBusy(true);
    try {
      await apiFetch(`/doctors/me/posts/${post.id}`, { method: "DELETE", accessToken });
      onChanged();
    } catch (err) {
      setActionError(err);
      setIsBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!photoFormat.check(file)) return;
    setActionError(null);
    setIsBusy(true);
    try {
      await apiUpload(`/doctors/me/posts/${post.id}/media?mediaType=PHOTO`, file, { accessToken });
      onChanged();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">{t(CATEGORY_LABEL_KEYS[post.category])}</span>
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">
          {visibility.icon} {t(visibility.labelKey)}
        </span>
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">{t(STATUS_LABEL_KEYS[post.status])}</span>
      </div>

      {post.title ? <p className="mt-3 font-heading text-lg text-brand-900">{post.title}</p> : null}
      <p className="mt-2 whitespace-pre-line text-base text-gray-900">{post.body}</p>

      {EDUCATIONAL_SET.has(post.category) ? <p className="mt-2 text-sm text-gray-500">{t("perfilPublico.disclaimerEducativo")}</p> : null}

      {post.media.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.media.map((m) => (
            <PostMediaThumbnail key={m.id} accessToken={accessToken} postId={post.id} mediaId={m.id} />
          ))}
        </div>
      ) : null}

      {photoFormat.notice ? (
        <div className="mt-3">
          <FileFormatNotice notice={photoFormat.notice} />
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-3">
          <ErrorState error={actionError} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-300 pt-4">
        <Button type="button" variant="secondary" disabled={isBusy} onClick={onEdit}>
          {t("common.acciones.editar")}
        </Button>
        {post.status === "DRAFT" ? (
          <Button type="button" isLoading={isBusy} onClick={() => void publish()}>
            {t("publicaciones.publicar")}
          </Button>
        ) : null}
        {post.status === "PUBLISHED" ? (
          <Button type="button" variant="secondary" isLoading={isBusy} onClick={() => void archive()}>
            {t("publicaciones.archivar")}
          </Button>
        ) : null}
        {post.status !== "ARCHIVED" ? (
          <label className="min-h-[44px] cursor-pointer rounded-md border border-gray-300 bg-white px-4 text-base font-medium text-gray-900 hover:bg-gray-100 inline-flex items-center">
            {isBusy ? t("publicaciones.subiendo") : t("publicaciones.agregarFoto")}
            <input
              type="file"
              className="hidden"
              disabled={isBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
        <Button type="button" variant="destructive" isLoading={isBusy} onClick={() => void remove()} className="ml-auto">
          {t("publicaciones.eliminar")}
        </Button>
      </div>
    </Card>
  );
}

function PostMediaThumbnail({ accessToken, postId, mediaId }: { accessToken: string; postId: string; mediaId: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchBlob(`/doctors/me/posts/${postId}/media/${mediaId}`, { accessToken }).then((blob) => {
      if (!cancelled && blob) setSrc(URL.createObjectURL(blob));
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, postId, mediaId]);

  if (!src) {
    return <div className="h-20 w-20 animate-pulse rounded-md bg-gray-100" />;
  }
  return <img src={src} alt="" className="h-20 w-20 rounded-md object-cover" />;
}
