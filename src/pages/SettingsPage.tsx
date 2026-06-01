import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

export function SettingsPage() {
  const { storeConfig, updateStoreConfig } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(storeConfig.logoUrl || null);

  const [form, setForm] = useState({
    storeName: storeConfig.storeName,
  });

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setLogoPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.storeName.trim()) {
      toast.error('Nome da loja é obrigatório');
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 400));

    updateStoreConfig({
      storeName: form.storeName,
      logoUrl: logoPreview || undefined,
    });

    setLoading(false);
    setIsEditing(false);
    toast.success('Configurações atualizadas com sucesso!');
  };

  const handleCancel = () => {
    setForm({ storeName: storeConfig.storeName });
    setLogoPreview(storeConfig.logoUrl || null);
    setIsEditing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.15)' }}
        >
          <Settings size={24} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-sm text-white/40">Gerencie as informações da sua loja</p>
        </div>
      </motion.div>

      {/* Current Config Display */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/30 font-medium mb-1">Configurações Atuais</p>
            <div className="flex items-center gap-3">
              {storeConfig.logoUrl && (
                <img
                  src={storeConfig.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 rounded-lg object-cover"
                />
              )}
              <div>
                <p className="text-sm text-white font-medium">{storeConfig.storeName}</p>
                <p className="text-xs text-white/40">
                  Atualizado em {new Date(storeConfig.updatedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Editar
          </Button>
        </div>
      </motion.div>

      {/* Edit Modal */}
      <Modal
        open={isEditing}
        onClose={handleCancel}
        title="Editar Configurações"
        subtitle="Atualize o nome e logo da sua loja"
      >
        <div className="space-y-5">
          {/* Logo Upload */}
          <div>
            <label className="block text-xs text-white/30 font-medium mb-2">Logo da Loja</label>
            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <Upload size={32} className="text-white/20" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                    className="hidden"
                  />
                  <div className="px-4 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg cursor-pointer text-sm text-indigo-200 font-medium transition-colors text-center">
                    Escolher Imagem
                  </div>
                </label>
                <p className="text-xs text-white/30">
                  PNG, JPG, GIF até 5MB
                </p>
                {logoPreview && (
                  <button
                    onClick={() => setLogoPreview(null)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Store Name */}
          <div>
            <label className="block text-xs text-white/30 font-medium mb-2">Nome da Loja</label>
            <Input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm(prev => ({ ...prev, storeName: e.target.value }))}
              placeholder="Ex: FRAZON STORE"
              className="w-full"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleCancel}
              className="flex-1 bg-white/5 hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
