// --- INÍCIO: CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://ccenxfyqwtfpexltuwrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZW54Znlxd3RmcGV4bHR1d3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNzE1MTMsImV4cCI6MjA2ODg0NzUxM30.6un31sODuCyd5Dz_pR_kn656k74jjh5CNAfF0YteT7I';

const { createClient } = supabase;
const dbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- FIM: CONFIGURAÇÃO DO SUPABASE ---

/**
 * Função auxiliar para buscar todas as linhas de uma tabela (superando o limite de 1000 linhas)
 * @param {string} tableName - Nome da tabela no Supabase
 * @returns {Promise<{data: any[], error: any}>}
 */
async function fetchAllRows(tableName) {
    let allRows = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await dbClient
            .from(tableName)
            .select('*')
            .range(from, from + limit - 1);

        if (error) return { data: null, error };

        if (data.length > 0) {
            allRows = allRows.concat(data);
            from += limit;
            if (data.length < limit) {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }
    return { data: allRows, error: null };
}
