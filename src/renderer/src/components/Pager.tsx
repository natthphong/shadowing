export default function Pager({
  page,
  total,
  pageSize,
  onPage
}: {
  page: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}): JSX.Element | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="w-9 h-9 rounded-full border border-outline-variant flex items-center justify-center text-secondary hover:bg-surface-container transition-colors disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      <span className="text-sm text-secondary">
        Page {page} / {totalPages} · {total} items
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="w-9 h-9 rounded-full border border-outline-variant flex items-center justify-center text-secondary hover:bg-surface-container transition-colors disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
  )
}
