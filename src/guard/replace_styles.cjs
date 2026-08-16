const fs = require('fs');

const files = [
  'c:/images/hostel/hostel-test/hostel-guard/src/guard/Dashboard.jsx',
  'c:/images/hostel/hostel-test/hostel-guard/src/guard/GateLogs.jsx',
  'c:/images/hostel/hostel-test/hostel-guard/src/guard/DayScholar.jsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');

  // Title text color
  c = c.replace(/text-3xl font-bold text-gray-900/g, 'text-3xl font-bold text-[#6d0f16]');

  // Metric Cards wrapper
  c = c.replace(/bg-white border border-gray-200 rounded-2xl px-5 py-2\.5 text-center min-w-\[100px\] shadow-sm/g, 'bg-white border border-gray-100 rounded-3xl p-6 min-w-[140px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center text-center');
  
  c = c.replace(/bg-white border border-gray-200 rounded-2xl p-5 shadow-sm/g, 'bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center');
  c = c.replace(/bg-white border border-gray-200 rounded-2xl p-5 shadow-sm text-center/g, 'bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center text-center');

  // Metric Title
  c = c.replace(/text-\[10px\] font-bold text-(emerald|red)-600 uppercase tracking-widest/g, 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-2');
  c = c.replace(/text-sm font-bold text-gray-500 uppercase tracking-widest/g, 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-2');

  // Metric Value
  c = c.replace(/text-2xl font-bold text-gray-900 leading-tight mt-0\.5/g, 'text-4xl font-bold text-[#6d0f16] mb-2');
  c = c.replace(/text-3xl font-bold text-gray-900 mt-2/g, 'text-4xl font-bold text-[#6d0f16] mb-2');
  c = c.replace(/text-3xl font-bold text-emerald-600 mt-2/g, 'text-4xl font-bold text-[#6d0f16] mb-2');

  // Colors inside cards / selections
  c = c.replace(/border-blue-500 ring-1 ring-blue-500\/50 bg-blue-50\/30/g, 'border-[#6d0f16] ring-1 ring-[#6d0f16]/50 bg-[#6d0f16]/5');
  c = c.replace(/text-blue-600/g, 'text-[#6d0f16]');
  c = c.replace(/bg-blue-600 border-blue-600/g, 'bg-[#6d0f16] border-[#6d0f16]');
  c = c.replace(/border-blue-500/g, 'border-[#6d0f16]');
  c = c.replace(/focus:ring-blue-500\/50/g, 'focus:ring-[#6d0f16]/50');

  // Strip badges remaining text if any
  c = c.replace(/'🏫 INSIDE'/g, "'INSIDE'");
  c = c.replace(/'🛑 OUTSIDE'/g, "'OUTSIDE'");
  c = c.replace(/>🏫 INSIDE</g, ">INSIDE<");
  c = c.replace(/>🛑 OUTSIDE</g, ">OUTSIDE<");

  fs.writeFileSync(f, c);
  console.log('Updated ' + f);
});
