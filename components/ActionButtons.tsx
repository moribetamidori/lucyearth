import React from 'react';

interface ActionButtonProps {
  onClick: (e: React.MouseEvent) => void;
  variant: 'edit' | 'delete' | 'move';
  className?: string;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  onClick,
  variant,
  className = ''
}) => {
  const baseClasses = "text-white px-1.5 py-0.5 text-xs transition-colors";

  const variantClasses = {
    edit: "bg-blue-500 hover:bg-blue-600",
    delete: "bg-red-500 hover:bg-red-600",
    move: "bg-blue-500 hover:bg-blue-600"
  };

  const labels = {
    edit: "Edit",
    delete: "Del",
    move: "Move"
  };

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {labels[variant]}
    </button>
  );
};

interface ActionButtonGroupProps {
  buttons: Array<{
    variant: 'edit' | 'delete' | 'move';
    onClick: (e: React.MouseEvent) => void;
  }>;
  className?: string;
}

export const ActionButtonGroup: React.FC<ActionButtonGroupProps> = ({
  buttons,
  className = ''
}) => {
  return (
    <div className={`absolute top-1 right-1 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${className}`}>
      {buttons.map((button, index) => (
        <ActionButton
          key={index}
          variant={button.variant}
          onClick={button.onClick}
        />
      ))}
    </div>
  );
};
