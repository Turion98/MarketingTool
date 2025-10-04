export type HeaderSlots = {
left?: React.ReactNode;
center?: React.ReactNode;
right?: React.ReactNode;
};


export type HeaderBarProps = HeaderSlots & {
variant?: "transparent" | "solid";
dense?: boolean; // kisebb magasság
elevated?: boolean; // árnyék / kiemelés
className?: string;
};

