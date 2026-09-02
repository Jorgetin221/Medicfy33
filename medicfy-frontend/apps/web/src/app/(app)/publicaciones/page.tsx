"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  doctorPostCreateSchema,
  EDUCATIONAL_POST_CATEGORIES,
  POST_CATEGORIES,
  type DoctorPostCreateInput,
  type PostCategory,
} from "@medicfy/contracts";
import { apiFetch, apiFetchBlob, apiUpload } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDoctorProfile } from "@/lib/use-doctor-profile";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, Textarea, SelectInput } from "@/components/ui/field";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";

const CATEGORY_LABELS: Record<PostCategory, string> = {
  HEALTH_EDUCATION: "Educación en salud",
  HEALTH_TIP: "Consejo de salud",
  HEALTH_FACT: "Dato curioso de salud",
  PROFESSIONAL_UPDATE: "Actualización profesional",
  CONGRESS: "Congreso",
  RESEARCH: "Investigación",
  CERTIFICATION: "Certificación",
  PATIENT_NOTICE: "Aviso para pacientes",
  PREVENTION: "Prevención",
  LIFESTYLE: "Hábitos de salud",
  VIDEO: "Video",
  PHOTO: "Fotografía",
  ANNOUNCEMENT: "Anuncio",
};

type PostVisibility = "PUBLIC" | "PATIENTS_ONLY" | "PRIVATE";
type PostLifecycleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const VISIBILITY_META: Record<PostVisibility, { label: string; icon: string }> = {
  PUBLIC: { label: "Público", icon: "🌎" },
  PATIENTS_ONLY: { label: "Solo mis pacientes", icon: "👥" },
  PRIVATE: { label: "Privado / borrador", icon: "🔒" },
};

const STATUS_LABELS: Record<PostLifecycleStatus, string> = { DRAFT: "Borrador", PUBLISHED: "Publicado", ARCHIVED: "Archivado" };

const EDUCATIONAL_SET = new Set<string>(EDUCATIONAL_POST_CATEGORIES);
const EDUCATIONAL_DISCLAIMER = "Información general con fines educativos. No sustituye una valoración médica individual.";

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
  const { doctor } = useDoctorProfile(accessToken);
  const [posts, setPosts] = useState<DoctorPost[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editingPost, setEditingPost] = useState<DoctorPost | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiFetch<DoctorPost[]>("/doctors/me/posts", { accessToken })
      .then(setPosts)
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">Publicaciones</h1>
          <p className="text-base text-gray-500">
            Comparte actualizaciones, educación en salud y avisos. Cada publicación tiene su propia audiencia.
          </p>
        </div>
        {doctor ? (
          <Link href={`/dr/${doctor.slug}`} className="mt-1 shrink-0 text-sm font-medium text-brand-700 underline">
            Ver mi perfil público
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
        <h2 className="font-heading text-xl text-brand-900">Mis publicaciones</h2>
        <div className="mt-4">
          {posts === null && !error ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={load} /> : null}
          {posts && posts.length === 0 ? (
            <EmptyState title="Sin publicaciones todavía" description="Crea la primera arriba." />
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
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<DoctorPostCreateInput>({
    resolver: zodResolver(doctorPostCreateSchema),
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
        <h2 className="font-heading text-xl text-brand-900">{editingPost ? "Editar publicación" : "+ Crear publicación"}</h2>
        {editingPost ? (
          <button type="button" onClick={onDoneEditing} className="text-sm font-medium text-gray-500 underline">
            Cancelar edición
          </button>
        ) : null}
      </div>
      <p className="text-sm text-gray-500">¿Qué quieres compartir?</p>

      <form className="mt-4 flex flex-col gap-4" noValidate>
        <FieldWrapper label="Título (opcional)" htmlFor="post-title" error={form.formState.errors.title?.message}>
          <TextInput id="post-title" error={!!form.formState.errors.title} {...form.register("title")} />
        </FieldWrapper>
        <FieldWrapper label="Contenido" htmlFor="post-body" error={form.formState.errors.body?.message}>
          <Textarea id="post-body" rows={5} error={!!form.formState.errors.body} {...form.register("body")} />
        </FieldWrapper>

        {EDUCATIONAL_SET.has(selectedCategory) ? (
          <Aviso variant="info" title="Aviso automático en esta categoría">
            {EDUCATIONAL_DISCLAIMER}
          </Aviso>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Categoría" htmlFor="post-category" error={form.formState.errors.category?.message}>
            <SelectInput id="post-category" {...form.register("category")}>
              {POST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
          <FieldWrapper label="¿Quién puede ver esta publicación?" htmlFor="post-visibility" error={form.formState.errors.visibility?.message}>
            <SelectInput id="post-visibility" {...form.register("visibility")}>
              <option value="PRIVATE">🔒 Solo yo / borrador</option>
              <option value="PATIENTS_ONLY">👥 Solo mis pacientes</option>
              <option value="PUBLIC">🌎 Público</option>
            </SelectInput>
          </FieldWrapper>
        </div>

        {error ? <ErrorState error={error} /> : null}
        {saved && !error ? <Aviso variant="exito" title="Guardado" /> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" isLoading={form.formState.isSubmitting} onClick={form.handleSubmit(saveDraft)}>
            Guardar borrador
          </Button>
          <Button type="button" isLoading={form.formState.isSubmitting} onClick={form.handleSubmit(saveAndPublish)}>
            Publicar
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
  const [actionError, setActionError] = useState<unknown>(null);
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
    if (!window.confirm("¿Borrar esta publicación? No se puede deshacer.")) return;
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
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">{CATEGORY_LABELS[post.category]}</span>
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">
          {visibility.icon} {visibility.label}
        </span>
        <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">{STATUS_LABELS[post.status]}</span>
      </div>

      {post.title ? <p className="mt-3 font-heading text-lg text-brand-900">{post.title}</p> : null}
      <p className="mt-2 whitespace-pre-line text-base text-gray-900">{post.body}</p>

      {EDUCATIONAL_SET.has(post.category) ? <p className="mt-2 text-sm text-gray-500">{EDUCATIONAL_DISCLAIMER}</p> : null}

      {post.media.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.media.map((m) => (
            <PostMediaThumbnail key={m.id} accessToken={accessToken} postId={post.id} mediaId={m.id} />
          ))}
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-3">
          <ErrorState error={actionError} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-300 pt-4">
        <Button type="button" variant="secondary" disabled={isBusy} onClick={onEdit}>
          Editar
        </Button>
        {post.status === "DRAFT" ? (
          <Button type="button" isLoading={isBusy} onClick={() => void publish()}>
            Publicar
          </Button>
        ) : null}
        {post.status === "PUBLISHED" ? (
          <Button type="button" variant="secondary" isLoading={isBusy} onClick={() => void archive()}>
            Archivar
          </Button>
        ) : null}
        {post.status !== "ARCHIVED" ? (
          <label className="min-h-[44px] cursor-pointer rounded-md border border-gray-300 bg-white px-4 text-base font-medium text-gray-900 hover:bg-gray-100 inline-flex items-center">
            {isBusy ? "Subiendo…" : "Agregar foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
        <Button type="button" variant="danger" isLoading={isBusy} onClick={() => void remove()} className="ml-auto">
          Eliminar
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
