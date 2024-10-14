export const utils = {
    formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
    }    
}