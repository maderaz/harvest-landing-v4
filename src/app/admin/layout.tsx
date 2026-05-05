import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Admin Panel",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                &larr; Back to site
              </Link>
              <div className="hidden h-5 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-4">
                <Link
                  href="/admin"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  SEO Overview
                </Link>
                <Link
                  href="/admin/products"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Products
                </Link>
                <Link
                  href="/admin/ranking-rules"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Ranking Rules
                </Link>
                <Link
                  href="/admin/changelog"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Changelog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
