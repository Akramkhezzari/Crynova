// database.js
class GitHubDatabase {
    constructor() {
        this.GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE'; // احصل عليه من GitHub Settings > Developer settings > Personal access tokens
        this.GIST_ID = 'YOUR_GIST_ID_HERE'; // سيتم إنشاؤه تلقائياً
        this.DB_FILENAME = 'coin_crynova_users.json';
        this.init();
    }

    async init() {
        if (!this.GIST_ID) {
            await this.createGist();
        }
    }

    async createGist() {
        try {
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: 'Coin Crynova Users Database',
                    public: false,
                    files: {
                        [this.DB_FILENAME]: {
                            content: JSON.stringify({ users: [] })
                        }
                    }
                })
            });

            const data = await response.json();
            this.GIST_ID = data.id;
            console.log('Gist created:', this.GIST_ID);
            return this.GIST_ID;
        } catch (error) {
            console.error('Error creating gist:', error);
            return null;
        }
    }

    async saveUserData(userId, userData) {
        try {
            // أولاً، احصل على البيانات الحالية
            const currentData = await this.getGistData();
            const users = currentData.users || [];
            
            // ابحث عن المستخدم أو أضفه
            const userIndex = users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                users[userIndex] = { ...users[userIndex], ...userData, lastUpdated: new Date().toISOString() };
            } else {
                users.push({ 
                    id: userId, 
                    ...userData, 
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                });
            }

            // احفظ البيانات المحدثة
            const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${this.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        [this.DB_FILENAME]: {
                            content: JSON.stringify({ users })
                        }
                    }
                })
            });

            if (response.ok) {
                console.log('User data saved successfully');
                return true;
            }
        } catch (error) {
            console.error('Error saving user data:', error);
        }
        return false;
    }

    async getUserData(userId) {
        try {
            const data = await this.getGistData();
            const user = data.users.find(u => u.id === userId);
            return user || null;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    async getAllUsers() {
        try {
            const data = await this.getGistData();
            return data.users || [];
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    async getLeaderboard(limit = 100) {
        try {
            const users = await this.getAllUsers();
            return users
                .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                .slice(0, limit)
                .map(user => ({
                    name: user.userName || 'مستخدم',
                    balance: user.balance || 0,
                    id: user.id
                }));
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    async getGistData() {
        try {
            const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`);
            const gist = await response.json();
            const content = gist.files[this.DB_FILENAME].content;
            return JSON.parse(content);
        } catch (error) {
            console.error('Error getting gist data:', error);
            return { users: [] };
        }
    }
}

// إنشاء نسخة عامة من قاعدة البيانات
const gameDB = new GitHubDatabase();
