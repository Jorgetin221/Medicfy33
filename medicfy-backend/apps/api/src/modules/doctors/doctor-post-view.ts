import type { DoctorPost, DoctorPostMedia } from "@prisma/client";

// M2B (spec §7, v2.2): la forma que ve cualquier lector que NO es el
// propio autor — público o "solo mis pacientes". Nunca expone
// doctorId, archivedByUserId ni el fileKey interno de cada medio (el
// cliente pide los bytes por id, vía la ruta correspondiente).
export interface PublicPostMediaView {
  id: string;
  mediaType: string;
  displayOrder: number;
}

export interface PublicPostView {
  id: string;
  title: string | null;
  body: string;
  category: string;
  publishedAt: string | null;
  media: PublicPostMediaView[];
}

export function toPublicPostView(post: DoctorPost, media: DoctorPostMedia[]): PublicPostView {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    category: post.category,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    media: media
      .filter((m) => m.postId === post.id)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((m) => ({ id: m.id, mediaType: m.mediaType, displayOrder: m.displayOrder })),
  };
}
