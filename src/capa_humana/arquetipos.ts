import { Dimensiones } from '../dominio/modelo/tipos';

export interface Arquetipo {
  id: string;
  label: string;
  dimensiones: Dimensiones;
}

/**
 * Los 5 arquetipos del §2.3 de CAPA_HUMANA.
 * Un clic, cero preguntas.
 */
export const ARQUETIPOS: Arquetipo[] = [
  { id: 'reunion', label: 'Reunión', dimensiones: { C: 2, A: 3, R: 3 } },
  { id: 'correo', label: 'Correo / mensajes', dimensiones: { C: 2, A: 2, R: 2 } },
  { id: 'escribir', label: 'Escribir / informe', dimensiones: { C: 4, A: 4, R: 4 } },
  { id: 'analizar', label: 'Analizar / decidir', dimensiones: { C: 5, A: 5, R: 4 } },
  { id: 'tramite', label: 'Trámite / administrativo', dimensiones: { C: 2, A: 2, R: 3 } },
];

/**
 * Busca un arquetipo por ID.
 */
export function buscarArquetipo(id: string): Arquetipo | undefined {
  return ARQUETIPOS.find(a => a.id === id);
}
