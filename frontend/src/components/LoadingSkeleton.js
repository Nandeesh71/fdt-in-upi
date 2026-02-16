import React from 'react';

/**
 * Reusable skeleton loader components for improving perceived performance
 * Shows placeholder content while actual data is loading
 */

export const CardSkeleton = () => (
  <div className="bg-white/5 rounded-2xl p-6 border border-white/10 animate-pulse">
    <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
    <div className="h-8 bg-white/20 rounded w-2/3"></div>
  </div>
);

export const TransactionSkeleton = () => (
  <div className="p-4 bg-white/5 rounded-lg border border-white/10 animate-pulse">
    <div className="flex justify-between items-center">
      <div className="flex-1">
        <div className="h-4 bg-white/20 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-white/10 rounded w-1/2"></div>
      </div>
      <div className="text-right ml-4">
        <div className="h-4 bg-white/20 rounded w-20 mb-2 ml-auto"></div>
        <div className="h-5 bg-white/10 rounded w-16 ml-auto"></div>
      </div>
    </div>
  </div>
);

export const ListSkeleton = ({ count = 5 }) => (
  <div className="space-y-3">
    {Array(count).fill(0).map((_, i) => (
      <TransactionSkeleton key={i} />
    ))}
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Stats Cards */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array(4).fill(0).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
    
    {/* Recent Transactions */}
    <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
      <div className="h-6 bg-white/20 rounded w-1/3 mb-4 animate-pulse"></div>
      <ListSkeleton count={3} />
    </div>
  </div>
);

export const TableRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4">
      <div className="h-4 bg-gray-200 rounded w-24"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-4 bg-gray-200 rounded w-32"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-4 bg-gray-200 rounded w-20"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-4 bg-gray-200 rounded w-16"></div>
    </td>
    <td className="px-6 py-4">
      <div className="h-5 bg-gray-200 rounded-full w-20"></div>
    </td>
  </tr>
);

export const TableSkeleton = ({ rows = 5 }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="h-3 bg-gray-300 rounded w-20 animate-pulse"></div>
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="h-3 bg-gray-300 rounded w-24 animate-pulse"></div>
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="h-3 bg-gray-300 rounded w-16 animate-pulse"></div>
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="h-3 bg-gray-300 rounded w-12 animate-pulse"></div>
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="h-3 bg-gray-300 rounded w-16 animate-pulse"></div>
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {Array(rows).fill(0).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </tbody>
    </table>
  </div>
);

const LoadingSkeletons = {
  CardSkeleton,
  TransactionSkeleton,
  ListSkeleton,
  DashboardSkeleton,
  TableSkeleton,
  TableRowSkeleton
};

export default LoadingSkeletons;
