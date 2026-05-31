import React, { useState } from 'react';
import { Plus, Trash2, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ApiKeyManagerProps {
  apiKeys: string;
  onUpdate: (keys: string) => void;
}

export function ApiKeyManager({ apiKeys, onUpdate }: ApiKeyManagerProps) {
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const keysArray = apiKeys.split(',').map(k => k.trim()).filter(k => k);

  const handleAddKey = () => {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;

    if (!trimmedKey.startsWith('AIza')) {
      setError('올바른 Gemini API 키 형식이 아닌 것 같습니다. (AIza로 시작해야 함)');
      return;
    }

    if (keysArray.includes(trimmedKey)) {
      setError('이미 등록된 API 키입니다.');
      return;
    }

    const updatedKeys = [...keysArray, trimmedKey].join(',');
    onUpdate(updatedKeys);
    setNewKey('');
    setError(null);
  };

  const handleRemoveKey = (index: number) => {
    const updatedKeysArray = keysArray.filter((_, i) => i !== index);
    onUpdate(updatedKeysArray.join(','));
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '****';
    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
  };

  return (
    <div className="space-y-4">
      {/* Input area */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold text-[#5A5A61] uppercase tracking-wider block">새 API 키 추가</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="password"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
              placeholder="AIza...로 시작하는 키를 입력하세요"
              className="w-full pl-9 pr-4 py-2 bg-[#FAF9F5] border border-[#EBE6DB] rounded-xl text-xs outline-none focus:border-[#96A7C1] focus:ring-1 focus:ring-[#96A7C1] transition-all"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A69E93]">
              <Key size={14} />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddKey}
            disabled={!newKey.trim()}
            className="px-4 py-2 bg-[#96A7C1] text-white rounded-xl text-xs font-bold hover:bg-[#8596B0] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[10px] text-[#E59A9A] font-bold flex items-center gap-1.5 px-1"
            >
              <AlertCircle size={12} /> {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* List area */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-[#5A5A61] uppercase tracking-wider block">등록된 키 ({keysArray.length})</label>
        <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {keysArray.length === 0 ? (
            <div className="py-8 border-2 border-dashed border-[#EBE6DB] rounded-xl flex flex-col items-center justify-center text-[#A69E93] gap-2">
              <Key size={24} className="opacity-20" />
              <p className="text-[11px] font-medium italic">등록된 키가 없습니다.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {keysArray.map((key, index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between p-3 bg-[#FAF9F5] border border-[#EBE6DB] rounded-xl group hover:border-[#96A7C1]/30 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-white border border-[#EBE6DB] flex items-center justify-center text-[#96A7C1]">
                      <CheckCircle2 size={12} />
                    </div>
                    <div>
                      <code className="text-[11px] font-mono text-[#4C4C54]">{maskKey(key)}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveKey(index)}
                    className="p-1.5 text-[#E59A9A] hover:bg-[#FFF0F2] rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    title="키 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
