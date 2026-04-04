import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../../contexts/NotificationContext"

export default function NotificationBell() {
    const { notifications, unreadCount, markAllRead } = useNotifications();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const toggleBell = () => {
        setOpen((v) => !v);
        if (!open) markAllRead();
    };

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={toggleBell}
                className="relative flex size-10 items-center justify-center rounded-full bg-white text-text-muted transition hover:bg-neutral-light"
            >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border-2 border-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-neutral-light bg-white shadow-lg">
                    <div className="flex items-center justify-between border-b border-neutral-light px-4 py-3">
                        <p className="text-sm font-semibold text-text-main">Notifications</p>
                        {notifications.length > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs text-text-muted hover:text-text-main transition"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <span className="material-symbols-outlined text-[32px] text-text-muted">
                                    notifications_none
                                </span>
                                <p className="mt-2 text-sm text-text-muted">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`flex gap-3 border-b border-neutral-light px-4 py-3 last:border-b-0 ${!n.read ? "bg-green-50" : ""
                                        }`}
                                >
                                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.type === "success" ? "bg-green-500" : "bg-blue-400"
                                        }`} />
                                    <div>
                                        <p className="text-sm text-text-main">{n.message}</p>
                                        <p className="mt-0.5 text-xs text-text-muted">
                                            {new Date(n.createdAt).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}