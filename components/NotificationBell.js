'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * Notification Bell Component
 * Shows unread count and dropdown with recent notifications
 * @param {string} userId - Current user's ID
 */
export default function NotificationBell({ userId }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
    setIsOpen(false);
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white focus:outline-none rounded-lg hover:bg-slate-700/50 transition-colors"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div className="absolute right-0 z-20 w-80 mt-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-80">
              {recentNotifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">
                  No notifications yet
                </div>
              ) : (
                recentNotifications.map(notification => (
                  <Link
                    key={notification.id}
                    href={notification.link || '/dashboard'}
                    onClick={() => handleNotificationClick(notification)}
                    className={`block px-4 py-3 hover:bg-slate-700 border-b border-slate-700 transition-colors ${
                      !notification.read ? 'bg-slate-700/50' : ''
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notification.read ? 'font-semibold text-white' : 'text-slate-300'}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(notification.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="ml-2 mt-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </div>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 5 && (
              <Link
                href="/notifications"
                className="block px-4 py-3 text-center text-sm text-blue-400 hover:text-blue-300 font-medium border-t border-slate-700"
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
