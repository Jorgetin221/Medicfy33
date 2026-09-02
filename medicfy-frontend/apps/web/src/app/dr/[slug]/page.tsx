import type { Metadata } from "next";
import { DoctorPublicProfile } from "./doctor-public-profile";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

interface PageParams {
  params: Promise<{ slug: string }>;
}

interface MetadataDoctor {
  displayName: string | null;
  primarySpecialtyName: string | null;
  biography: string | null;
  photoUrl: string | null;
}

// M5-RN-007: única página pública real de la app — todo lo demás vive
// detrás de sesión, así que ninguna otra pantalla necesitó nunca
// metadata. Solo generateMetadata hace fetch en el servidor (para
// title/OpenGraph reales, no inventados); el contenido interactivo lo
// pinta DoctorPublicProfile del lado del cliente — mismo patrón que
// /verificar/[token], la otra página pública de la app.
export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/doctors/${slug}/public`, { cache: "no-store" });
    if (!res.ok) return { title: "Medicfy" };
    const doctor = (await res.json()) as MetadataDoctor;
    const name = doctor.displayName ?? "Médico en Medicfy";
    const specialty = doctor.primarySpecialtyName ?? "Medicina General";
    const description = doctor.biography ? doctor.biography.slice(0, 160) : `${name} · ${specialty} en Medicfy.`;
    return {
      title: `${name} · ${specialty} — Medicfy`,
      description,
      openGraph: {
        title: name,
        description,
        images: doctor.photoUrl ? [doctor.photoUrl] : undefined,
      },
    };
  } catch {
    return { title: "Medicfy" };
  }
}

export default async function DoctorPublicPage({ params }: PageParams) {
  const { slug } = await params;
  return <DoctorPublicProfile slug={slug} />;
}
